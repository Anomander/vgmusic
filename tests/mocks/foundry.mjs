import { vi } from 'vitest';

export class MockDocument {
  constructor(data = {}) {
    Object.assign(this, data);
  }
}

function getProperty(obj, path) {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr == null || typeof curr !== 'object') return undefined;
    curr = curr[part];
  }
  return curr;
}

function setProperty(obj, path, value) {
  if (!obj || typeof obj !== 'object' || !path) return false;
  const parts = path.split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (curr[part] == null || typeof curr[part] !== 'object') {
      curr[part] = {};
    }
    curr = curr[part];
  }
  curr[parts[parts.length - 1]] = value;
  return true;
}

function createMockSettings() {
  const store = new Map();
  return {
    get: vi.fn((moduleId, key) => store.get(`${moduleId}.${key}`)),
    set: vi.fn((moduleId, key, val) => {
      store.set(`${moduleId}.${key}`, val);
      return Promise.resolve(val);
    }),
    register: vi.fn(),
    registerMenu: vi.fn(),
    _store: store
  };
}

class MockApplicationV2 {
  static DEFAULT_OPTIONS = {};
  static PARTS = {};
  constructor(options = {}) {
    this.options = options;
  }
  _onRender(context, options) {}
  _onClose(options) {}
  render() {}
  close() {}
}

function MockHandlebarsApplicationMixin(Base) {
  return class extends Base {};
}

class MockDragDrop {
  constructor(options = {}) {
    this.options = options;
  }
  bind() {}
}

export function setupFoundryMocks(overrides = {}) {
  const settings = createMockSettings();
  const gmUser = { id: 'gm1', isGM: true, active: true };

  globalThis.game = {
    settings,
    user: gmUser,
    users: Object.assign([gmUser], {
      filter: function (fn) {
        return Array.prototype.filter.call(this, fn);
      }
    }),
    scenes: Object.assign([], { active: null }),
    combats: { active: null },
    playlists: Object.assign([], { get: vi.fn(), playing: [] }),
    audio: { locked: false },
    vgmusic: { musicController: null, moodWidget: null },
    i18n: { localize: vi.fn((key) => key) },
    ...overrides
  };

  globalThis.ui = {
    notifications: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn()
    }
  };

  globalThis.foundry = {
    abstract: { Document: MockDocument },
    utils: {
      getProperty: vi.fn(getProperty),
      setProperty: vi.fn(setProperty),
      mergeObject: vi.fn((original, other) => ({ ...original, ...other })),
      expandObject: vi.fn((obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const res = {};
        for (const [k, v] of Object.entries(obj)) setProperty(res, k, v);
        return res;
      }),
      deepClone: vi.fn((obj) => (obj ? JSON.parse(JSON.stringify(obj)) : obj))
    },
    applications: {
      api: {
        ApplicationV2: MockApplicationV2,
        HandlebarsApplicationMixin: MockHandlebarsApplicationMixin
      },
      ux: {
        DragDrop: MockDragDrop
      }
    }
  };

  globalThis.CONST = {
    PLAYLIST_MODES: { UNSEQUENCED: -1, SEQUENTIAL: 0, SHUFFLE: 1, SIMULTANEOUS: 2 }
  };

  globalThis.Hooks = { on: vi.fn(), once: vi.fn() };

  if (!globalThis.document) {
    globalThis.document = {};
  }
  globalThis.document.addEventListener = vi.fn();
  globalThis.document.removeEventListener = vi.fn();

  return { settings, MockDocument };
}

// Automatically setup defaults upon import so top-level destructured globals work
setupFoundryMocks();

export function setMockSetting(moduleId, key, value) {
  game.settings._store.set(`${moduleId}.${key}`, value);
}

export function createMockSound(id, name, overrides = {}) {
  return {
    id,
    name,
    playing: false,
    volume: 1.0,
    sound: { currentTime: 0, loaded: true, playing: false, fade: vi.fn(() => Promise.resolve()), stop: vi.fn(), volume: 1.0 },
    parent: { playSound: vi.fn(() => Promise.resolve()), stopSound: vi.fn(() => Promise.resolve()) },
    play: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    update: vi.fn(() => Promise.resolve()),
    ...overrides
  };
}

export function createMockPlaylist(id, name, sounds = [], mode = 0) {
  const soundsMap = new Map(sounds.map((s) => [s.id, s]));
  soundsMap.find = (fn) => sounds.find(fn);
  soundsMap.contents = sounds;
  return {
    id,
    name,
    mode,
    sounds: soundsMap,
    playbackOrder: sounds.map((s) => s.id),
    sheet: { render: vi.fn() }
  };
}
