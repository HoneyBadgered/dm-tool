import { z } from "zod";

export const MAX_ENTRY_QUANTITY = 50;
export const MAX_COMBATANTS = 200;
export const MAX_HP = 999_999;
export const MIN_INITIATIVE = -20;
export const MAX_INITIATIVE = 60;
export const MAX_ARMOR_CLASS = 99;
export const MAX_ROUND = 10_000;
export const MAX_NAME_LENGTH = 80;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_EFFECT_DURATION_ROUNDS = 1000;
export const SNAPSHOT_SCHEMA_VERSION = 1;
export const PAYLOAD_SCHEMA_VERSION = 1;

export const CREATURE_KINDS = [
  "monster",
  "npc",
  "player_character",
  "custom",
] as const;
export const HP_MODES = ["average", "rolled", "manual"] as const;
export const COMBAT_SIDES = ["party", "enemy", "neutral"] as const;
export const COMBAT_STATUSES = ["setup", "running", "paused", "ended"] as const;
export const COMBATANT_STATUSES = ["active", "defeated", "removed"] as const;
export const EFFECT_KINDS = ["condition", "ongoing"] as const;
export const EFFECT_EXPIRY_TRIGGERS = [
  "none",
  "start_of_target_turn",
  "end_of_target_turn",
  "start_of_source_turn",
  "end_of_source_turn",
] as const;

export type CreatureKindValue = (typeof CREATURE_KINDS)[number];
export type HpModeValue = (typeof HP_MODES)[number];
export type CombatSideValue = (typeof COMBAT_SIDES)[number];
export type CombatStatusValue = (typeof COMBAT_STATUSES)[number];
export type CombatantStatusValue = (typeof COMBATANT_STATUSES)[number];
export type EffectKindValue = (typeof EFFECT_KINDS)[number];
export type EffectExpiryTriggerValue = (typeof EFFECT_EXPIRY_TRIGGERS)[number];

/** Allowed combat status changes. `ended` is terminal. */
export const COMBAT_TRANSITIONS: Record<
  CombatStatusValue,
  readonly CombatStatusValue[]
> = {
  setup: ["running", "ended"],
  running: ["paused", "ended"],
  paused: ["running", "ended"],
  ended: [],
};

export function canTransitionCombat(
  from: CombatStatusValue,
  to: CombatStatusValue,
): boolean {
  return COMBAT_TRANSITIONS[from].includes(to);
}

export const idSchema = z.string().trim().min(1, "Id is required").max(100);
const name = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`);
const optionalNote = z
  .string()
  .trim()
  .max(MAX_NOTE_LENGTH, `Notes must be at most ${MAX_NOTE_LENGTH} characters`)
  .nullish()
  .transform((v) => (v ? v : null));
const hp = z.number().int().min(1).max(MAX_HP);
const armorClass = z.number().int().min(0).max(MAX_ARMOR_CLASS);
const initiativeValue = z
  .number()
  .int()
  .min(MIN_INITIATIVE)
  .max(MAX_INITIATIVE);
const modifier = z.number().int().min(-20).max(20);

export const DICE_EXPRESSION_PATTERN =
  /^\s*(\d{1,3})d(\d{1,4})\s*(?:([+-])\s*(\d{1,4}))?\s*$/i;
const diceExpression = z
  .string()
  .max(30)
  .regex(DICE_EXPRESSION_PATTERN, "Invalid dice expression");

/** Frozen copy of a creature's stats taken when a combatant is created. */
export const creatureSnapshotSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  kind: z.enum(CREATURE_KINDS),
  name,
  armorClass,
  maxHp: hp,
  hpAverage: hp.nullable(),
  hpRoll: diceExpression.nullable(),
  initiativeModifier: modifier,
  speed: z.array(z.string().max(200)).max(20),
  abilityScores: z
    .array(z.object({ label: z.string().max(10), value: z.number() }))
    .max(6),
  savingThrowsAndSkills: z.array(z.string().max(100)).max(40),
  damageVulnerabilities: z.array(z.string().max(200)).max(40),
  damageResistances: z.array(z.string().max(200)).max(40),
  damageImmunities: z.array(z.string().max(200)).max(40),
  conditionImmunities: z.array(z.string().max(100)).max(40),
  senses: z.array(z.string().max(200)).max(20),
  languages: z.array(z.string().max(200)).max(30),
  challengeRating: z.string().max(10).nullable(),
  experience: z.number().int().min(0).nullable(),
  sections: z
    .array(
      z.object({
        title: z.string().max(100),
        entries: z
          .array(
            z.object({
              name: z.string().max(200),
              description: z.string().max(10_000),
              usage: z.string().max(100).optional(),
              save: z
                .object({
                  ability: z.string().max(10),
                  dc: z.number().int().min(1).max(60),
                  successType: z.enum(["none", "half"]).nullable(),
                })
                .optional(),
            }),
          )
          .max(60),
      }),
    )
    .max(10),
  attacks: z
    .array(
      z.object({
        name: z.string().max(200),
        attackBonus: z.number().int().nullable(),
        damage: z
          .array(
            z.object({
              dice: z.string().max(30),
              damageType: z.string().max(60).nullable(),
            }),
          )
          .max(10),
      }),
    )
    .max(60),
  source: z
    .object({
      ruleEntryId: z.string().nullable(),
      sourceKey: z.string().nullable(),
      contentHash: z.string().nullable(),
      srdLabel: z.string().nullable(),
      apiEdition: z.string().nullable(),
      verifiedSrdRevision: z.string().nullable(),
    })
    .nullable(),
});
export type CreatureSnapshot = z.output<typeof creatureSnapshotSchema>;

export const entryOverridesSchema = z
  .object({
    maxHp: hp.optional(),
    armorClass: armorClass.optional(),
    initiativeModifier: modifier.optional(),
    notes: optionalNote.optional(),
  })
  .strict();
export type EntryOverrides = z.output<typeof entryOverridesSchema>;

export const bossPhasesSchema = z
  .array(
    z
      .object({
        name,
        hpAtOrBelow: z.number().int().min(0).max(MAX_HP).optional(),
        notes: optionalNote.optional(),
      })
      .strict(),
  )
  .max(10);
export type BossPhases = z.output<typeof bossPhasesSchema>;

const entryFields = {
  label: name,
  quantity: z.number().int().min(1).max(MAX_ENTRY_QUANTITY).default(1),
  side: z.enum(COMBAT_SIDES).nullish(),
  hpMode: z.enum(HP_MODES).default("average"),
  overrides: entryOverridesSchema.nullish(),
  startsHidden: z.boolean().default(false),
  wave: z.number().int().min(0).max(20).default(0),
};

export const encounterEntryInputSchema = z
  .object({
    kind: z.enum(CREATURE_KINDS),
    ruleEntryId: idSchema.nullish(),
    npcId: idSchema.nullish(),
    playerCharacterId: idSchema.nullish(),
    ...entryFields,
  })
  .superRefine((v, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: "custom", message, path: [path] });
    if (v.kind === "monster" && !v.ruleEntryId)
      fail("A monster entry requires a library monster", "ruleEntryId");
    if (v.kind === "npc" && !v.npcId)
      fail("An NPC entry requires an NPC", "npcId");
    if (v.kind === "player_character") {
      if (!v.playerCharacterId)
        fail("A player entry requires a character", "playerCharacterId");
      if (v.quantity !== 1)
        fail("A player character can only be added once", "quantity");
    }
    if (v.kind === "monster" && (v.npcId || v.playerCharacterId))
      fail("A monster entry cannot reference an NPC or player", "kind");
    if (v.kind === "custom") {
      if (v.ruleEntryId || v.npcId || v.playerCharacterId)
        fail("A custom entry cannot reference other records", "kind");
      if (!v.overrides?.maxHp || v.overrides.armorClass === undefined)
        fail("A custom entry needs maxHp and armorClass", "overrides");
      if (v.hpMode !== "manual")
        fail("A custom entry must use manual HP", "hpMode");
    }
    if (v.kind === "npc" && !v.ruleEntryId) {
      if (!v.overrides?.maxHp || v.overrides.armorClass === undefined)
        fail(
          "An NPC without a stat basis needs maxHp and armorClass",
          "overrides",
        );
      if (v.hpMode !== "manual")
        fail("An NPC without a stat basis must use manual HP", "hpMode");
    }
    if (v.kind === "player_character" && v.hpMode !== "manual")
      fail("A player character must use manual HP", "hpMode");
    if (v.hpMode === "manual" && !v.overrides?.maxHp && v.kind === "monster")
      fail("Manual HP needs an overrides.maxHp value", "overrides");
  });
export type EncounterEntryInput = z.output<typeof encounterEntryInputSchema>;

export const encounterEntryUpdateSchema = z
  .object({
    label: entryFields.label.optional(),
    quantity: z.number().int().min(1).max(MAX_ENTRY_QUANTITY).optional(),
    side: z.enum(COMBAT_SIDES).nullish(),
    hpMode: z.enum(HP_MODES).optional(),
    overrides: entryOverridesSchema.nullish(),
    startsHidden: z.boolean().optional(),
    wave: entryFields.wave.optional(),
  })
  .strict();

// ---- Event payloads (stored as JSON; parsed on read) -----------------------

const nullableInt = z.number().int().nullable();
const combatFields = z
  .object({
    status: z.enum(COMBAT_STATUSES),
    round: z.number().int().min(1).max(MAX_ROUND),
    activeCombatantId: z.string().nullable(),
    startedAt: z.string().nullable(),
  })
  .partial()
  .strict();
const combatantFields = z
  .object({
    name,
    initiative: nullableInt,
    initiativeTieBreak: z.number().int(),
    currentHp: z.number().int().min(0).max(MAX_HP),
    maxHp: hp,
    tempHp: z.number().int().min(0).max(MAX_HP),
    armorClass,
    status: z.enum(COMBATANT_STATUSES),
    isHidden: z.boolean(),
    notes: z.string().nullable(),
    bossPhases: z.array(z.unknown()).nullable(),
    currentPhase: z.number().int().min(0),
  })
  .partial()
  .strict();
const effectFields = z
  .object({
    isActive: z.boolean(),
    endedAt: z.string().nullable(),
    name: z.string(),
    note: z.string().nullable(),
    concentration: z.boolean(),
    expiresAtRound: z.number().int().nullable(),
    expiryTrigger: z.enum(EFFECT_EXPIRY_TRIGGERS),
    metadata: z.unknown().nullable(),
  })
  .partial()
  .strict();

export const changeSchema = z.union([
  z.object({
    kind: z.literal("update"),
    entity: z.literal("combat"),
    id: idSchema,
    before: combatFields,
    after: combatFields,
  }),
  z.object({
    kind: z.literal("update"),
    entity: z.literal("combatant"),
    id: idSchema,
    before: combatantFields,
    after: combatantFields,
  }),
  z.object({
    kind: z.literal("update"),
    entity: z.literal("effect"),
    id: idSchema,
    before: effectFields,
    after: effectFields,
  }),
  z.object({
    kind: z.literal("create"),
    entity: z.enum(["combatant", "effect"]),
    id: idSchema,
    row: z.record(z.string(), z.unknown()),
  }),
]);
export type Change = z.output<typeof changeSchema>;

export const eventPayloadSchema = z.object({
  schemaVersion: z.literal(PAYLOAD_SCHEMA_VERSION),
  changes: z.array(changeSchema).max(500),
  detail: z.record(z.string(), z.unknown()),
});
export type EventPayload = z.output<typeof eventPayloadSchema>;

// ---- Commands --------------------------------------------------------------

const commandBase = {
  combatId: idSchema,
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
};

/** Structured record of a confirmed dice roll, stored on its log event. */
export const rollDetailSchema = z.object({
  kind: z.enum(["attack", "save", "check"]),
  label: z.string().max(80),
  natural: z.number().int(),
  bonus: z.number().int(),
  total: z.number().int(),
  against: z.string().max(20),
  verdict: z.string().max(30),
  manualDice: z.boolean(),
  overrides: z.array(z.string().max(40)).max(10),
});
export type RollDetail = z.output<typeof rollDetailSchema>;

export const SAVE_ABILITIES = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
] as const;

/** Reminder-only data. The app never rolls or resolves a save or damage itself. */
export const effectMetadataSchema = z
  .object({
    damageDice: diceExpression.optional(),
    damageType: z.string().trim().max(40).optional(),
    level: z.number().int().min(1).max(20).optional(),
    save: z
      .object({
        ability: z.enum(SAVE_ABILITIES),
        dc: z.number().int().min(1).max(40),
        timing: z.enum(["start", "end"]),
      })
      .strict()
      .optional(),
    remindAt: z.enum(["start", "end"]).optional(),
  })
  .strict();
export type EffectMetadata = z.output<typeof effectMetadataSchema>;

export const effectInputSchema = z
  .object({
    ...commandBase,
    targetId: idSchema,
    sourceCombatantId: idSchema.nullish(),
    kind: z.enum(EFFECT_KINDS),
    name,
    conditionIndex: z.string().trim().min(1).max(100).nullish(),
    note: optionalNote,
    concentration: z.boolean().default(false),
    durationRounds: z
      .number()
      .int()
      .min(1)
      .max(MAX_EFFECT_DURATION_ROUNDS)
      .nullish(),
    expiryTrigger: z.enum(EFFECT_EXPIRY_TRIGGERS).default("none"),
    metadata: effectMetadataSchema.nullish(),
  })
  .superRefine((v, ctx) => {
    const timed = v.durationRounds != null;
    if (timed && v.expiryTrigger === "none")
      ctx.addIssue({
        code: "custom",
        path: ["expiryTrigger"],
        message: "A timed effect needs an expiry trigger",
      });
    if (!timed && v.expiryTrigger !== "none")
      ctx.addIssue({
        code: "custom",
        path: ["durationRounds"],
        message: "An expiry trigger needs a duration",
      });
    if (v.expiryTrigger.endsWith("source_turn") && !v.sourceCombatantId)
      ctx.addIssue({
        code: "custom",
        path: ["sourceCombatantId"],
        message: "A source-turn expiry needs a source combatant",
      });
    if (v.kind === "ongoing" && !v.metadata?.damageDice && !v.note)
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "An ongoing effect needs a description or damage dice",
      });
  });
export type EffectInput = z.output<typeof effectInputSchema>;

export const DAMAGE_ADJUSTMENTS = [
  "none",
  "resistance",
  "vulnerability",
  "immunity",
] as const;
export type DamageAdjustment = (typeof DAMAGE_ADJUSTMENTS)[number];

const hpNote = z.string().trim().max(200).nullish();

export const commandSchemas = {
  setInitiative: z.object({
    ...commandBase,
    combatantId: idSchema,
    initiative: initiativeValue.nullable(),
    tieBreak: z.number().int().min(-1000).max(1000).optional(),
  }),
  rollInitiative: z.object({
    ...commandBase,
    combatantIds: z.array(idSchema).min(1).max(MAX_COMBATANTS),
    // Without this, combatants that already have an initiative are left alone.
    overwrite: z.boolean().default(false),
  }),
  setActiveCombatant: z.object({ ...commandBase, combatantId: idSchema }),
  moveInitiative: z.object({
    ...commandBase,
    combatantId: idSchema,
    direction: z.enum(["up", "down"]),
  }),
  advanceTurn: z.object({
    ...commandBase,
    direction: z.enum(["next", "previous"]),
  }),
  damage: z.object({
    ...commandBase,
    combatantId: idSchema,
    // The raw amount rolled; the adjustment is applied once on the server.
    amount: z.number().int().min(1).max(MAX_HP),
    damageType: z.string().trim().max(40).nullish(),
    adjustment: z.enum(DAMAGE_ADJUSTMENTS).default("none"),
    // The DM's final number, replacing the calculated one (0 is allowed).
    override: z.number().int().min(0).max(MAX_HP).optional(),
    note: hpNote,
    roll: rollDetailSchema.optional(),
  }),
  heal: z.object({
    ...commandBase,
    combatantId: idSchema,
    amount: z.number().int().min(1).max(MAX_HP),
    note: hpNote,
  }),
  setCurrentHp: z.object({
    ...commandBase,
    combatantId: idSchema,
    value: z.number().int().min(0).max(MAX_HP),
    note: hpNote,
  }),
  setTempHp: z.object({
    ...commandBase,
    combatantId: idSchema,
    value: z.number().int().min(0).max(MAX_HP),
    mode: z.enum(["replace", "keep_higher"]).default("keep_higher"),
    note: hpNote,
  }),
  setMaxHp: z.object({
    ...commandBase,
    combatantId: idSchema,
    maxHp: hp,
  }),
  setVisibility: z.object({
    ...commandBase,
    combatantId: idSchema,
    isHidden: z.boolean(),
  }),
  setDefeated: z.object({
    ...commandBase,
    combatantId: idSchema,
    defeated: z.boolean(),
  }),
  updateCombatant: z
    .object({
      ...commandBase,
      combatantId: idSchema,
      name: name.optional(),
      notes: optionalNote.optional(),
      armorClass: armorClass.optional(),
      bossPhases: bossPhasesSchema.nullish(),
      currentPhase: z.number().int().min(0).max(10).optional(),
    })
    .superRefine((v, ctx) => {
      if (
        v.currentPhase !== undefined &&
        v.bossPhases &&
        v.currentPhase > v.bossPhases.length
      )
        ctx.addIssue({
          code: "custom",
          path: ["currentPhase"],
          message: "Phase is beyond the configured boss phases",
        });
    }),
  removeCombatant: z.object({ ...commandBase, combatantId: idSchema }),
  restoreCombatant: z.object({ ...commandBase, combatantId: idSchema }),
  addCombatant: z.object({
    ...commandBase,
    name,
    side: z.enum(COMBAT_SIDES),
    maxHp: hp,
    armorClass,
    initiative: initiativeValue.nullish(),
    isHidden: z.boolean().default(false),
    notes: optionalNote,
  }),
  addPlayerCharacter: z.object({
    ...commandBase,
    playerCharacterId: idSchema,
    initiative: initiativeValue.nullish(),
    isHidden: z.boolean().default(false),
  }),
  addWave: z.object({
    ...commandBase,
    wave: z.number().int().min(1).max(20),
  }),
  removeEffect: z.object({
    ...commandBase,
    effectId: idSchema,
    resolution: z.enum(["removed", "resolved", "expired"]).default("removed"),
    note: optionalNote,
  }),
  updateEffect: z
    .object({
      ...commandBase,
      effectId: idSchema,
      name: name.optional(),
      // undefined keeps the current note; an empty string clears it.
      note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
      concentration: z.boolean().optional(),
      extendRounds: z
        .number()
        .int()
        .min(1)
        .max(MAX_EFFECT_DURATION_ROUNDS)
        .optional(),
      expiresAtRound: z
        .number()
        .int()
        .min(1)
        .max(MAX_EFFECT_DURATION_ROUNDS * 2)
        .nullish(),
      expiryTrigger: z.enum(EFFECT_EXPIRY_TRIGGERS).optional(),
      metadata: effectMetadataSchema.nullish(),
    })
    .refine((v) => !(v.extendRounds && v.expiresAtRound !== undefined), {
      message: "Use either extendRounds or expiresAtRound",
    }),
  addNote: z.object({
    ...commandBase,
    text: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
    roll: rollDetailSchema.optional(),
  }),
  setCombatStatus: z.object({
    ...commandBase,
    to: z.enum(["running", "paused"]),
    allowMissingInitiative: z.boolean().default(false),
  }),
  endCombat: z.object({ ...commandBase }),
  undoLast: z.object({ ...commandBase, force: z.boolean().default(false) }),
};

export const createCombatFromEncounterSchema = z.object({
  encounterId: idSchema,
  name: name.optional(),
});

export const createAdHocCombatSchema = z.object({
  campaignId: idSchema,
  name: name.optional(),
});
