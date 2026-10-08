// Specialist roles of the multi-agent runtime. Prompts live in orchestrator/prompts/.
export const ROLES = {
  canon: {
    label: "Canon Keeper",
    prompt: "CANON_KEEPER.md",
    keywords: [],
  },
  historical: {
    label: "Historical Consistency",
    prompt: "HISTORICAL_CONSISTENCY.md",
    keywords: ["оруж", "винтов", "автомат", "пистол", "пулем", "пулём", "патрон", "граната", "машин", "грузовик", "танк",
      "поезд", "вагон", "паровоз", "радио", "рация", "телефон", "телеграф", "лекарств", "медицин", "госпитал", "больниц",
      "технолог", "транспорт", "генератор", "форма", "одежд", "weapon", "rifle", "gun", "vehicle", "truck", "train",
      "radio", "phone", "medicine", "medical", "technology", "tech_", "vehicle_", "item_"],
  },
  game_design: {
    label: "Game Design",
    prompt: "GAME_DESIGN.md",
    keywords: ["механик", "крафт", "прокачк", "навык", "уровн", "баланс", "выживан", "укреплен", "укреплён", "фортиф",
      "лут", "кооп", "голод", "холод", "стресс", "mechanic", "craft", "skill", "level up", "balance", "survival",
      "fortif", "loot", "co-op", "coop", "recipe_"],
  },
  character: {
    label: "Character & Lore",
    prompt: "CHARACTER_LORE.md",
    keywords: ["персонаж", "геро", "трейт", "черт", "привычк", "професси", "биограф", "психолог", "дар", "способност",
      "character", "hero", "trait", "habit", "profession", "ability", "char_", "trait_", "prof_", "ability_"],
  },
  level: {
    label: "Level & World",
    prompt: "LEVEL_WORLD.md",
    keywords: ["район", "локац", "здани", "город", "карт", "мост", "вокзал", "завод", "депо", "окраин", "лес", "блиндаж",
      "district", "location", "building", "map", "poi", "district_", "loc_"],
  },
  asset: {
    label: "Asset",
    prompt: "ASSET.md",
    keywords: ["модел", "ассет", "визуал", "текстур", "внешн", "blender", "meshy", "asset", "model", "visual", "texture", "lod"],
  },
  technical: {
    label: "Technical",
    prompt: "TECHNICAL.md",
    keywords: ["код", "реализ", "задач", "движок", "сохранени", "прототип", "implement", "code", "engine", "task", "prototype", "save"],
  },
  qa: {
    label: "QA",
    prompt: "QA.md",
    keywords: ["тест", "провер", "баг", "эксплойт", "test", "qa", "bug", "exploit"],
  },
};

export const ROLE_KEYS = Object.keys(ROLES);
