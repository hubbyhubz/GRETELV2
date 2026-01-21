import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyTabTitle, getTabKeyFromDashboardContextView, getTabKeyFromTopLevelView, resolveTabTitle, TAB_TITLE_MAP } from './tabTitle';

describe('tabTitle', () => {
  beforeEach(() => {
    document.title = '';
  });

  it('resolves known titles', () => {
    expect(resolveTabTitle('login')).toBe(TAB_TITLE_MAP.login);
    expect(resolveTabTitle('setup')).toBe(TAB_TITLE_MAP.setup);
    expect(resolveTabTitle('dashboard')).toBe(TAB_TITLE_MAP.dashboard);
    expect(resolveTabTitle('settings')).toBe(TAB_TITLE_MAP.settings);
  });

  it('warns and falls back for unknown keys', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveTabTitle('unknown')).toBe('G.R.E.T.E.L');
    expect(warn).toHaveBeenCalled();
  });

  it('applies title to document', () => {
    applyTabTitle('dashboard');
    expect(document.title).toBe(TAB_TITLE_MAP.dashboard);
  });

  it('maps top-level views to tab keys', () => {
    expect(getTabKeyFromTopLevelView('login')).toBe('login');
    expect(getTabKeyFromTopLevelView('createAccount')).toBe('login');
    expect(getTabKeyFromTopLevelView('forgotPassword')).toBe('login');
    expect(getTabKeyFromTopLevelView('setupWizard')).toBe('setup');
    expect(getTabKeyFromTopLevelView('dashboard')).toBe('dashboard');
    expect(getTabKeyFromTopLevelView('privacyPolicy')).toBeUndefined();
  });

  it('maps dashboard context view to settings/dashboard', () => {
    expect(getTabKeyFromDashboardContextView('settings')).toBe('settings');
    expect(getTabKeyFromDashboardContextView('dashboard')).toBe('dashboard');
    expect(getTabKeyFromDashboardContextView(undefined)).toBe('dashboard');
  });
});

