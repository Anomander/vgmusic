import { CONST } from './config.mjs';
import { log } from './helpers.mjs';
import { PlaylistTreeApp } from './playlist-tree.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dockable / Floating Mood Widget application for GMs
 */
export class MoodWidget extends HandlebarsApplicationMixin(ApplicationV2) {
  _positionSaveTimer = null;

  static DEFAULT_OPTIONS = {
    id: 'vgmusic-mood-widget',
    tag: 'div',
    window: {
      title: 'VGMusic.MoodWidget.Title',
      icon: 'fas fa-sliders-h',
      resizable: false,
      minimizable: false
    },
    classes: ['vgmusic-mood-widget'],
    position: { width: 260, height: 'auto' },
    actions: {
      setMood: MoodWidget.handleSetMood,
      refreshMood: MoodWidget.handleRefreshMood,
      toggleDock: MoodWidget.handleToggleDock,
      toggleCompact: MoodWidget.handleToggleCompact,
      openPlaylistTree: MoodWidget.handleOpenPlaylistTree
    }
  };

  /** @override */
  static PARTS = { main: { template: 'modules/vgmusic/templates/mood-widget.hbs' } };

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if (!this.hasFrame) return frame;

    const pos = game.settings.get(CONST.moduleId, CONST.settings.moodWidgetPosition) || {};
    const isDocked = !!pos.isDocked;
    const dockedIcon = isDocked ? 'fa-window-maximize' : 'fa-anchor';

    const closeBtn = frame.querySelector('.window-header [data-action="close"]');
    if (closeBtn) {
      let treeBtn = frame.querySelector('[data-action="openPlaylistTree"]');
      if (!treeBtn) {
        const treeBtnHtml = `<button type="button" class="header-control fa-solid fa-sitemap icon" data-action="openPlaylistTree" data-tooltip="${game.i18n.localize('VGMusic.PlaylistTree.Title')}" aria-label="Open Playlist Tree"></button>`;
        closeBtn.insertAdjacentHTML('beforebegin', treeBtnHtml);
      }

      let refreshBtn = frame.querySelector('[data-action="refreshMood"]');
      if (!refreshBtn) {
        const refreshBtnHtml = `<button type="button" class="header-control fa-solid fa-sync-alt icon" data-action="refreshMood" data-tooltip="${game.i18n.localize('VGMusic.MoodWidget.Refresh')}" aria-label="Refresh Mood"></button>`;
        closeBtn.insertAdjacentHTML('beforebegin', refreshBtnHtml);
      }

      let compactBtn = frame.querySelector('[data-action="toggleCompact"]');
      if (!compactBtn) {
        const compactBtnHtml = `<button type="button" class="header-control fa-solid fa-compress icon" data-action="toggleCompact" data-tooltip="Toggle Compact Mode" aria-label="Toggle Compact Mode"></button>`;
        closeBtn.insertAdjacentHTML('beforebegin', compactBtnHtml);
      }

      let dockBtn = frame.querySelector('[data-action="toggleDock"]');
      if (!dockBtn) {
        const dockBtnHtml = `<button type="button" class="header-control fa-solid ${dockedIcon} icon" data-action="toggleDock" data-tooltip="${game.i18n.localize('VGMusic.MoodWidget.Dock')}" aria-label="Toggle Dock"></button>`;
        closeBtn.insertAdjacentHTML('beforebegin', dockBtnHtml);
      } else {
        dockBtn.className = `header-control fa-solid ${dockedIcon} icon`;
      }
    }
    return frame;
  }

  /** @override */
  _prepareContext(_options) {
    const activeMood = game.settings.get(CONST.moduleId, CONST.settings.activeMood) || '';
    const configuredMoods = game.settings.get(CONST.moduleId, CONST.settings.configuredMoods) || CONST.defaultMoods;
    const pos = game.settings.get(CONST.moduleId, CONST.settings.moodWidgetPosition) || {};

    const moods = configuredMoods.map((m) => ({
      ...m,
      isActive: m.id === activeMood
    }));

    const activeMoodObj = configuredMoods.find((m) => m.id === activeMood) || null;

    return { activeMood, moods, activeMoodObj, isDocked: !!pos.isDocked };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    const pos = game.settings.get(CONST.moduleId, CONST.settings.moodWidgetPosition) || {};
    const isDocked = !!pos.isDocked;

    // Update window header icon and title with active mood
    const iconEl = this.element.querySelector('.window-header .window-icon');
    const titleEl = this.element.querySelector('.window-header .window-title');
    const activeObj = context.activeMoodObj;

    if (activeObj) {
      const moodLabel = activeObj.label?.startsWith('VGMusic.') ? game.i18n.localize(activeObj.label) : activeObj.label;
      if (titleEl) titleEl.textContent = moodLabel;
      if (iconEl) iconEl.className = `window-icon fa-fw ${activeObj.icon}`;
    } else {
      const defaultLabel = game.i18n.localize('VGMusic.Default');
      if (titleEl) titleEl.textContent = defaultLabel;
      if (iconEl) iconEl.className = 'window-icon fa-fw fas fa-music';
    }

    if (titleEl) {
      titleEl.style.cursor = 'pointer';
      titleEl.style.pointerEvents = 'auto';

      // Double-click listener on title text checking e.detail === 2
      titleEl.onclick = (e) => {
        if (e.detail === 2) {
          e.preventDefault();
          e.stopPropagation();
          MoodWidget.handleToggleCompact(e, titleEl);
        }
      };
    }

    // Restore compact state from saved position
    if (pos.isCompact) {
      this.element.classList.add('compact');
      const compactBtn = this.element.querySelector('[data-action="toggleCompact"]');
      if (compactBtn) compactBtn.className = 'header-control fa-solid fa-expand icon';
    }

    if (isDocked) {
      const container = document.querySelector('#ui-left-column-1') || document.querySelector('#ui-left');
      if (container) {
        this.element.classList.add('docked');

        this._applyDockedStyles();

        // Set JS mouseenter/mouseleave translucency handlers
        if (this.element.matches(':hover')) {
          this.element.style.setProperty('opacity', '1.0', 'important');
        } else {
          this.element.style.setProperty('opacity', '0.45', 'important');
        }

        this.element.onmouseenter = () => {
          if (this.element.classList.contains('docked')) {
            this.element.style.setProperty('opacity', '1.0', 'important');
          }
        };

        this.element.onmouseleave = () => {
          if (this.element.classList.contains('docked')) {
            this.element.style.setProperty('opacity', '0.45', 'important');
          }
        };

        const players = container.querySelector('#players') || document.querySelector('#players');

        if (players && players.parentNode) {
          if (this.element.previousElementSibling !== players) {
            players.after(this.element);
          }
        } else if (!container.contains(this.element)) {
          container.appendChild(this.element);
        }
      }
    } else {
      this.element.classList.remove('docked');
      this.element.onmouseenter = null;
      this.element.onmouseleave = null;

      const uiTop = document.querySelector('#ui-top') || document.body;
      const leftColumn = document.querySelector('#ui-left-column-1') || document.querySelector('#ui-left');

      // Clear inline docked styles when switching back to floating mode
      this.element.style.removeProperty('position');
      this.element.style.removeProperty('top');
      this.element.style.removeProperty('left');
      this.element.style.removeProperty('width');
      this.element.style.removeProperty('height');
      this.element.style.removeProperty('opacity');

      if (leftColumn && leftColumn.contains(this.element)) {
        uiTop.appendChild(this.element);
        const top = pos.top ?? 120;
        const left = pos.left ?? 120;
        this.setPosition({ top, left, width: 260 });
      } else if (this.position.top == null || this.position.left == null) {
        const top = pos.top ?? 120;
        const left = pos.left ?? 120;
        this.setPosition({ top, left, width: 260 });
      }
    }
  }

  /**
   * Apply inline docked styles to override ApplicationV2 position defaults
   * @private
   */
  _applyDockedStyles() {
    if (!this.element) return;
    this.element.style.setProperty('position', 'relative', 'important');
    this.element.style.setProperty('top', 'auto', 'important');
    this.element.style.setProperty('left', 'auto', 'important');
    this.element.style.setProperty('width', '100%', 'important');
    this.element.style.setProperty('height', 'auto', 'important');
    this.element.style.setProperty('pointer-events', 'auto', 'important');
  }

  /** @override */
  _onPosition(position) {
    super._onPosition(position);
    const currentPos = game.settings.get(CONST.moduleId, CONST.settings.moodWidgetPosition) || {};
    if (currentPos.isDocked && this.element) {
      this._applyDockedStyles();
      if (!this.element.matches(':hover')) {
        this.element.style.setProperty('opacity', '0.45', 'important');
      }
      return;
    }
    if (!currentPos.isDocked && position.top != null && position.left != null) {
      if (currentPos.top !== position.top || currentPos.left !== position.left) {
        clearTimeout(this._positionSaveTimer);
        this._positionSaveTimer = setTimeout(() => {
          game.settings.set(CONST.moduleId, CONST.settings.moodWidgetPosition, {
            ...currentPos,
            top: position.top,
            left: position.left
          });
        }, 500);
      }
    }
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    if (game.vgmusic?.moodWidget === this) {
      game.vgmusic.moodWidget = null;
    }
    // Persist closed state so it is not re-opened on next page load
    try {
      const currentPos = game.settings.get(CONST.moduleId, CONST.settings.moodWidgetPosition) || {};
      game.settings.set(CONST.moduleId, CONST.settings.moodWidgetPosition, { ...currentPos, isOpen: false });
    } catch (e) { /* settings not available */ }
  }

  static async handleSetMood(event, target) {
    event.preventDefault();
    const button = target.closest('[data-mood-id]') || target;
    const moodId = button.dataset?.moodId ?? '';
    const currentActive = game.settings.get(CONST.moduleId, CONST.settings.activeMood) || '';
    const targetMood = moodId === currentActive ? '' : moodId;
    try {
      await game.settings.set(CONST.moduleId, CONST.settings.activeMood, targetMood);
      log(3, `Active mood set to: '${targetMood || 'none'}'`);
    } catch (error) {
      log(1, 'Error setting active mood:', error);
    }
  }

  /**
   * Handle re-triggering the current mood selection
   */
  static async handleRefreshMood(event, target) {
    event?.preventDefault?.();
    if (game.vgmusic?.musicController) {
      await game.vgmusic.musicController.playCurrentTrack();
    }
  }

  /**
   * Handle opening the playlist hierarchy tree manager window
   */
  static handleOpenPlaylistTree(event, target) {
    event?.preventDefault?.();
    PlaylistTreeApp.open();
  }

  /**
   * Toggle compact mode for the widget
   */
  static handleToggleCompact(event, target) {
    event?.preventDefault?.();
    const widget = game.vgmusic?.moodWidget || (this instanceof MoodWidget ? this : null);
    if (!widget?.element) return;
    const isCompact = widget.element.classList.toggle('compact');
    const compactBtn = widget.element.querySelector('[data-action="toggleCompact"]');
    if (compactBtn) {
      compactBtn.className = `header-control fa-solid ${isCompact ? 'fa-expand' : 'fa-compress'} icon`;
    }
    // Persist compact state
    try {
      const currentPos = game.settings.get(CONST.moduleId, CONST.settings.moodWidgetPosition) || {};
      game.settings.set(CONST.moduleId, CONST.settings.moodWidgetPosition, { ...currentPos, isCompact });
    } catch (e) { /* settings not available */ }
  }

  /**
   * Toggle docked mode for the widget
   */
  static async handleToggleDock(event, target) {
    event?.preventDefault?.();
    const currentPos = game.settings.get(CONST.moduleId, CONST.settings.moodWidgetPosition) || {};
    const newDocked = !currentPos.isDocked;

    const dockBtn = target?.closest?.('[data-action="toggleDock"]') || target;
    if (dockBtn) {
      dockBtn.className = `header-control fa-solid ${newDocked ? 'fa-window-maximize' : 'fa-anchor'} icon`;
    }

    await game.settings.set(CONST.moduleId, CONST.settings.moodWidgetPosition, {
      ...currentPos,
      isDocked: newDocked
    });
    const widget = game.vgmusic?.moodWidget || (this instanceof MoodWidget ? this : null);
    if (widget?.rendered) widget.render(true);
  }

  /**
   * Toggle window visibility
   */
  static toggle() {
    if (!game.vgmusic) return;
    if (game.vgmusic.moodWidget && game.vgmusic.moodWidget.rendered) {
      game.vgmusic.moodWidget.close();
      game.vgmusic.moodWidget = null;
      return;
    }
    MoodWidget.open();
  }

  /**
   * Open the widget and persist the open state
   */
  static open() {
    if (!game.vgmusic) return;
    if (game.vgmusic.moodWidget?.rendered) return;
    game.vgmusic.moodWidget = new MoodWidget();
    game.vgmusic.moodWidget.render(true);
    // Persist open state
    try {
      const currentPos = game.settings.get(CONST.moduleId, CONST.settings.moodWidgetPosition) || {};
      game.settings.set(CONST.moduleId, CONST.settings.moodWidgetPosition, { ...currentPos, isOpen: true });
    } catch (e) { /* settings not available */ }
  }
}
