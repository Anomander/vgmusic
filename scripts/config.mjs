/**
 * Configuration constants for the VGMusic module
 */
export const CONST = {
  moduleId: 'vgmusic',
  settings: {
    defaultMusic: 'defaultMusic',
    suppressArea: 'suppressArea',
    suppressCombat: 'suppressCombat',
    fadeDuration: 'fadeDuration',
    activeMood: 'activeMood',
    configuredMoods: 'configuredMoods',
    moodWidgetPosition: 'moodWidgetPosition'
  },
  defaultMoods: [
    { id: 'calm', label: 'VGMusic.Mood.Calm', icon: 'fas fa-leaf', color: '#4caf50' },
    { id: 'tense', label: 'VGMusic.Mood.Tense', icon: 'fas fa-exclamation-triangle', color: '#ff9800' },
    { id: 'boss', label: 'VGMusic.Mood.Boss', icon: 'fas fa-skull', color: '#f44336' },
    { id: 'stealth', label: 'VGMusic.Mood.Stealth', icon: 'fas fa-user-ninja', color: '#9c27b0' },
    { id: 'victory', label: 'VGMusic.Mood.Victory', icon: 'fas fa-trophy', color: '#ffeb3b' }
  ],
  playlistSections: {
    DefaultMusic: {
      area: { label: 'VGMusic.PlaylistSection.Area', priority: -40 },
      combat: { label: 'VGMusic.PlaylistSection.Combat', priority: -35 }
    },
    Scene: { area: { label: 'VGMusic.PlaylistSection.Area', priority: -20 }, combat: { label: 'VGMusic.PlaylistSection.Combat', priority: -15 } },
    Actor: { combat: { label: 'VGMusic.PlaylistSection.Combat', priority: 0 } },
    Token: { combat: { label: 'VGMusic.PlaylistSection.Combat', priority: 20 } }
  }
};
