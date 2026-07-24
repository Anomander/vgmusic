import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupFoundryMocks, setMockSetting } from './mocks/foundry.mjs';

setupFoundryMocks();

import {
  handleUpdateCombat,
  handleDeleteCombat,
  handleCreateCombatant,
  handleDeleteCombatant,
  handleUpdateCombatant,
  handleUserConnected,
  handleCanvasReady,
  handleUpdateScene,
  handleUpdateActor,
  handleUpdateToken,
  handleReady,
  getSceneControlButtons,
  handleTokenConfigRender
} from '../scripts/hooks.mjs';
import { CONST } from '../scripts/config.mjs';
import { MoodWidget } from '../scripts/mood-widget.mjs';

describe('hooks.mjs', () => {
  let mockController;

  beforeEach(() => {
    setupFoundryMocks();
    mockController = { playCurrentTrack: vi.fn() };
    game.vgmusic = { musicController: mockController };
  });

  describe('handleUpdateCombat', () => {
    it('calls playCurrentTrack when combat.started and updateData.turn is updated', () => {
      const combat = { started: true };
      handleUpdateCombat(combat, { turn: 2 });
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });

    it('calls playCurrentTrack when combat.started and updateData.round is updated', () => {
      const combat = { started: true };
      handleUpdateCombat(combat, { round: 1 });
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });

    it('does NOT call playCurrentTrack when combat is not started', () => {
      const combat = { started: false };
      handleUpdateCombat(combat, { turn: 2 });
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
    });

    it('does NOT call when neither turn nor round is in updateData', () => {
      const combat = { started: true };
      handleUpdateCombat(combat, { active: true });
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe('handleDeleteCombat', () => {
    it('calls playCurrentTrack on combat deletion', () => {
      handleDeleteCombat();
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleCanvasReady', () => {
    it('calls playCurrentTrack on canvas ready', () => {
      handleCanvasReady();
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleUserConnected', () => {
    it('calls playCurrentTrack on any GM connect/disconnect so headship handoff is picked up', () => {
      handleUserConnected({ id: 'gm2', isGM: true }, false);
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleCreateCombatant', () => {
    it('calls playCurrentTrack when parent combat is started', () => {
      const combatant = { parent: { started: true } };
      handleCreateCombatant(combatant);
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });

    it('does NOT call playCurrentTrack when parent combat is not started', () => {
      const combatant = { parent: { started: false } };
      handleCreateCombatant(combatant);
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe('handleDeleteCombatant', () => {
    it('calls playCurrentTrack when parent combat is started', () => {
      const combatant = { parent: { started: true } };
      handleDeleteCombatant(combatant);
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });

    it('does NOT call playCurrentTrack when parent combat is not started', () => {
      const combatant = { parent: { started: false } };
      handleDeleteCombatant(combatant);
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateCombatant', () => {
    it('calls playCurrentTrack when defeated status changes and parent combat is started', () => {
      const combatant = { parent: { started: true } };
      handleUpdateCombatant(combatant, { defeated: true });
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });

    it('does NOT call playCurrentTrack when parent combat is not started', () => {
      const combatant = { parent: { started: false } };
      handleUpdateCombatant(combatant, { defeated: true });
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
    });

    it('does NOT call playCurrentTrack for unrelated updates', () => {
      const combatant = { parent: { started: true } };
      handleUpdateCombatant(combatant, { initiative: 15 });
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateScene', () => {
    it('calls playCurrentTrack when vgmusic music flag changes', () => {
      const scene = {};
      const updateData = { flags: { [CONST.moduleId]: { music: { area: { playlist: 'p1' } } } } };

      handleUpdateScene(scene, updateData);
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });

    it('calls playCurrentTrack when scene active property changes', () => {
      const scene = {};
      const updateData = { active: true };

      handleUpdateScene(scene, updateData);
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });

    it('does NOT call playCurrentTrack for unrelated scene updates', () => {
      const scene = {};
      const updateData = { name: 'New Name' };

      handleUpdateScene(scene, updateData);
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateActor', () => {
    it('calls playCurrentTrack when vgmusic music flag changes', () => {
      const actor = {};
      const updateData = { flags: { [CONST.moduleId]: { music: {} } } };

      handleUpdateActor(actor, updateData);
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });

    it('does NOT call playCurrentTrack for unrelated actor updates', () => {
      const actor = {};
      const updateData = { name: 'New Hero' };

      handleUpdateActor(actor, updateData);
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe('handleUpdateToken', () => {
    it('calls playCurrentTrack when vgmusic music flag changes', () => {
      const token = {};
      const updateData = { flags: { [CONST.moduleId]: { useTokenMusic: true } } };

      handleUpdateToken(token, updateData);
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
    });

    it('does NOT call playCurrentTrack for unrelated token updates', () => {
      const token = {};
      const updateData = { x: 100, y: 200 };

      handleUpdateToken(token, updateData);
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe('getSceneControlButtons', () => {
    it('populates music suppression tools into controls.sounds.tools', () => {
      const controls = {
        sounds: {
          tools: {}
        }
      };

      getSceneControlButtons(controls);

      expect(controls.sounds.tools['suppress-area-music']).toBeDefined();
      expect(controls.sounds.tools['suppress-combat-music']).toBeDefined();
      expect(controls.sounds.tools['mood-widget']).toBeDefined();
    });

    it('gracefully handles missing sounds tools object', () => {
      expect(() => getSceneControlButtons({})).not.toThrow();
    });

    it('does not populate tools for non-GM users', () => {
      game.user = { isGM: false };
      const controls = { sounds: { tools: {} } };

      getSceneControlButtons(controls);

      expect(controls.sounds.tools['suppress-area-music']).toBeUndefined();
      expect(controls.sounds.tools['suppress-combat-music']).toBeUndefined();
      expect(controls.sounds.tools['mood-widget']).toBeUndefined();
    });
  });

  describe('handleTokenConfigRender', () => {
    it('returns early when current user is not GM', () => {
      game.user = { isGM: false };
      const app = {};
      const html = { querySelector: vi.fn() };

      handleTokenConfigRender(app, html);
      expect(html.querySelector).not.toHaveBeenCalled();
    });

    it('returns early when identity tab is not found', () => {
      game.user = { isGM: true };
      const app = {};
      const html = { querySelector: vi.fn().mockReturnValue(null) };

      handleTokenConfigRender(app, html);
      expect(html.querySelector).toHaveBeenCalledWith('[data-application-part="identity"]');
    });
  });

  describe('handleReady', () => {
    it('calls playCurrentTrack after delay', () => {
      vi.useFakeTimers();
      handleReady();
      expect(mockController.playCurrentTrack).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1050);
      expect(mockController.playCurrentTrack).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('restores mood widget open state when isOpen is true in position settings', () => {
      const openSpy = vi.spyOn(MoodWidget, 'open').mockImplementation(() => {});

      setMockSetting('vgmusic', 'moodWidgetPosition', { isOpen: true });

      handleReady();

      expect(openSpy).toHaveBeenCalledTimes(1);
      openSpy.mockRestore();
    });
  });
});
