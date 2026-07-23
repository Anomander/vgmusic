import { CONST } from './config.mjs';
import { log } from './helpers.mjs';
import { MoodWidget } from './mood-widget.mjs';
import { VGMusicConfig } from './app.mjs';

const _loc = (key) => game.i18n.localize(key);

/**
 * Add scene control buttons for music suppression
 * @param {object} controls - The scene controls object
 */
export function getSceneControlButtons(controls) {
  try {
    if (controls.sounds && controls.sounds.tools) {
      controls.sounds.tools['suppress-area-music'] = {
        name: 'suppress-area-music',
        order: 10,
        title: 'VGMusic.Controls.SuppressAreaMusic',
        icon: 'fas fa-dungeon',
        toggle: true,
        visible: true,
        active: game.settings.get(CONST.moduleId, CONST.settings.suppressArea),
        onChange: (_event, active) => {
          game.settings.set(CONST.moduleId, CONST.settings.suppressArea, active);
        }
      };
      controls.sounds.tools['suppress-combat-music'] = {
        name: 'suppress-combat-music',
        order: 11,
        title: 'VGMusic.Controls.SuppressCombatMusic',
        icon: 'fas fa-fist-raised',
        toggle: true,
        visible: true,
        active: game.settings.get(CONST.moduleId, CONST.settings.suppressCombat),
        onChange: (_event, active) => {
          game.settings.set(CONST.moduleId, CONST.settings.suppressCombat, active);
        }
      };
      controls.sounds.tools['mood-widget'] = {
        name: 'mood-widget',
        order: 12,
        title: 'VGMusic.MoodWidget.Title',
        icon: 'fas fa-sliders-h',
        button: true,
        visible: true,
        onChange: () => {
          MoodWidget.toggle();
        }
      };
    }
  } catch (error) {
    log(1, 'Error adding scene control buttons:', error);
  }
}

/**
 * Handle scene config render to inject music button
 * @param {object} app - The scene config application
 * @param {HTMLElement} html - The rendered HTML
 */
export function handleSceneConfigRender(app, html) {
  try {
    const playlistSoundSelect = html.querySelector('select[name="playlistSound"]');
    if (!playlistSoundSelect) return;
    const existingFormGroup = playlistSoundSelect.closest('.form-group');
    if (!existingFormGroup) return;
    const newFormGroup = document.createElement('div');
    newFormGroup.className = 'form-group';
    const label = document.createElement('label');
    label.textContent = _loc('VGMusic.CombatMusic');
    const formFields = document.createElement('div');
    formFields.className = 'form-fields';
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = 'vgmusic-scene';
    button.innerHTML = `<i class="fas fa-music"></i> ${_loc('VGMusic.ConfigTitle')}`;
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = _loc('VGMusic.Settings.DefaultMusic.Hint');
    formFields.appendChild(button);
    newFormGroup.appendChild(label);
    newFormGroup.appendChild(formFields);
    newFormGroup.appendChild(hint);
    existingFormGroup.insertAdjacentElement('afterend', newFormGroup);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      new VGMusicConfig(app.document).render(true);
    });
  } catch (error) {
    log(1, 'Error adding scene config button:', error);
  }
}

/**
 * Handle combat updates to trigger music changes
 * @param {object} combat - The combat document
 * @param {object} updateData - The update data
 */
export function handleUpdateCombat(combat, updateData) {
  if ('started' in updateData || (combat.started && (updateData.turn != null || updateData.round != null))) {
    game.vgmusic?.musicController?.playCurrentTrack();
  }
}

/**
 * Handle combat deletion to stop music
 */
export function handleDeleteCombat() {
  game.vgmusic?.musicController?.playCurrentTrack();
}

/**
 * Handle combatant creation to refresh music
 * @param {object} combatant - The created combatant
 */
export function handleCreateCombatant(combatant) {
  if (combatant.parent?.started) game.vgmusic?.musicController?.playCurrentTrack();
}

/**
 * Handle combatant deletion to refresh music
 * @param {object} combatant - The deleted combatant
 */
export function handleDeleteCombatant(combatant) {
  if (combatant.parent?.started) game.vgmusic?.musicController?.playCurrentTrack();
}

/**
 * Handle canvas ready to start music
 */
export function handleCanvasReady() {
  game.vgmusic?.musicController?.playCurrentTrack();
}

/**
 * Handle scene updates for music flag changes
 * @param {object} scene - The scene document
 * @param {object} updateData - The update data
 */
export function handleUpdateScene(scene, updateData) {
  const flags = updateData.flags?.[CONST.moduleId];
  const hasMusicFlagChange = flags && ('music' in flags || 'useTokenMusic' in flags);
  const hasActiveChange = 'active' in updateData;

  if (hasMusicFlagChange || hasActiveChange) {
    game.vgmusic?.musicController?.playCurrentTrack();
  }
}

/**
 * Handle actor updates for music flag changes
 * @param {object} _actor - The actor document
 * @param {object} updateData - The update data
 */
export function handleUpdateActor(_actor, updateData) {
  const flags = updateData.flags?.[CONST.moduleId];
  if (flags && ('music' in flags || 'useTokenMusic' in flags)) game.vgmusic?.musicController?.playCurrentTrack();
}

/**
 * Handle token updates for music flag changes
 * @param {Document} _token - The token document
 * @param {object} updateData - The update data
 */
export function handleUpdateToken(_token, updateData) {
  const flags = updateData.flags?.[CONST.moduleId];
  if (flags && ('music' in flags || 'useTokenMusic' in flags)) game.vgmusic?.musicController?.playCurrentTrack();
}

/**
 * Handle TokenConfig render to inject music configuration
 * @param {object} app - The application
 * @param {HTMLElement} html - The rendered HTML
 * @param {object} _context - Render context
 * @param {object} _options - Render options
 */
export function handleTokenConfigRender(app, html, _context, _options) {
  try {
    if (!game.user.isGM) return;
    const identityTab = html.querySelector('[data-application-part="identity"]') || html.querySelector('[data-tab="identity"].tab') || html.querySelector('.tab[data-tab="identity"]');
    if (!identityTab) return;
    const nameField = identityTab.querySelector('.form-group');
    if (!nameField) return;
    const isPrototype = app.constructor.name.includes('Prototype');
    const token = isPrototype ? app.actor?.prototypeToken : app.token;
    if (!token) return;
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    const label = document.createElement('label');
    label.textContent = _loc('VGMusic.CombatMusic');
    const formFields = document.createElement('div');
    formFields.className = 'form-fields';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vgmusic-token-config';
    button.innerHTML = `<i class="fas fa-music"></i> ${_loc('VGMusic.ConfigTitle')}`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      new VGMusicConfig(token).render(true);
    });
    formFields.appendChild(button);
    formGroup.appendChild(label);
    formGroup.appendChild(formFields);
    nameField.insertAdjacentElement('afterend', formGroup);
    const isLinked = token.actorLink ?? false;
    if (isLinked && !isPrototype) {
      const useTokenMusic = token.getFlag?.(CONST.moduleId, 'useTokenMusic') ?? false;
      const checkboxGroup = document.createElement('div');
      checkboxGroup.className = 'form-group';
      const checkLabel = document.createElement('label');
      checkLabel.textContent = _loc('VGMusic.UseTokenMusic.Label');
      const checkFields = document.createElement('div');
      checkFields.className = 'form-fields';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'flags.vgmusic.useTokenMusic';
      checkbox.checked = useTokenMusic;
      checkFields.appendChild(checkbox);
      checkboxGroup.appendChild(checkLabel);
      checkboxGroup.appendChild(checkFields);
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = _loc('VGMusic.UseTokenMusic.Hint');
      checkboxGroup.appendChild(hint);
      formGroup.insertAdjacentElement('afterend', checkboxGroup);
    }
  } catch (error) {
    log(1, 'Error adding token config button:', error);
  }
}

/**
 * Handle game ready to start music after delay
 */
export async function handleReady() {
  setTimeout(() => {
    game.vgmusic?.musicController?.playCurrentTrack();
  }, 1000);

  // Restore mood widget open state from the previous session
  try {
    const pos = game.settings.get('vgmusic', 'moodWidgetPosition') || {};
    if (pos.isOpen && game.vgmusic) {
      MoodWidget.open();
    }
  } catch (e) { /* settings not yet available */ }
}
