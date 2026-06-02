import { test, expect } from '@playwright/test';
import { AgencyFormPage } from '../../../pages/CC Apply/AgencyForm.page';
import { BeforeYouStartPage } from '../../../pages/CC Apply/BeforeYouStart.page';
import { getLoginIdentityForSpec } from '../../test-data/centralizedTestData';
import { environment } from '../../config/environment';

/**
 * BYS Mandatory Check
 * Verifies that the Before You Start page enforces mandatory field/option selection
 * before allowing the user to proceed.
 */
test('BYS: mandatory selection required before proceeding', async ({ page }, testInfo) => {
  test.setTimeout(180000);

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);
  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();

  const loginIdentity = getLoginIdentityForSpec('BYSMandatoryCheck.spec.ts');
  const loginEmail = loginIdentity.email;
  const agencyFormUrl = `${environment.DTP_ROOT_URL || 'https://forms.preprod.beta.my.qld.gov.au'}/companioncardapply/agency-form`;

  const handleDraftFailedModal = async (): Promise<boolean> => {
    const draftFailedHeading = page.getByRole('heading', { name: /draft.*failed|failed.*draft/i });
    const draftFailedVisible = await draftFailedHeading.isVisible({ timeout: 3000 }).catch(() => false);
    if (!draftFailedVisible) {
      return false;
    }
    await page.getByRole('button', { name: /back to start/i }).click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await draftFailedHeading.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    return true;
  };

  const waitForBysOrDraft = async (timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const bysVisible = await bysHeading.isVisible({ timeout: 2000 }).catch(() => false);
      if (bysVisible) {
        return true;
      }

      const draftVisible = await beforeYouStartPage.draftDialog.isVisible().catch(() => false);
      if (draftVisible) {
        return true;
      }

      await page.waitForTimeout(1000);
    }

    return false;
  };

  const recoverAuthIfNeeded = async (): Promise<boolean> => {
    const loginHeading = page.getByRole('heading', { name: /login to continue/i });
    const loginVisible = await loginHeading.isVisible({ timeout: 5000 }).catch(() => false);
    if (!loginVisible) {
      return false;
    }

    await agencyFormPage.loginWithIdentity(loginIdentity.provider, loginEmail);

    // After login+consent, the app may land on the root companioncardapply URL.
    // Navigate directly to agency-form to avoid polling indefinitely on the wrong page.
    await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await agencyFormPage.ensureNoLoadingError().catch(() => {});
    return await waitForBysOrDraft(30000);
  };

  const ensureBysWithFreshMyIdLogin = async () => {
    await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' });
    await agencyFormPage.ensureNoLoadingError();
    await handleDraftFailedModal();

    const alreadyAtBys = await waitForBysOrDraft(8000);
    if (alreadyAtBys) {
      return;
    }

    const recovered = await recoverAuthIfNeeded();
    await handleDraftFailedModal();

    if (recovered) {
      const bysAfterRecovery = await waitForBysOrDraft(30000);
      if (bysAfterRecovery) {
        return;
      }

      throw new Error(
        `Identity login completed but app did not return to Before You Start. Current URL: ${page.url()}.`
      );
    }

    // Full login path: do not rely on any saved auth state.
    await agencyFormPage.loginWithIdentity(loginIdentity.provider, loginEmail, { navigateFromEntry: true });
    await handleDraftFailedModal();

    const bysVisible = await waitForBysOrDraft(180000);
    if (!bysVisible) {
      throw new Error(
        `Auth session is not valid for BYS Mandatory Check after full ${loginIdentity.provider} login flow. ` +
        `Timed out waiting for Before You Start after identity login. Current URL: ${page.url()}.`
      );
    }
  };

  // Stable auth entry: use env/mapped myID email and recover login inline when needed.
  await ensureBysWithFreshMyIdLogin();
  await beforeYouStartPage.startNewIfDraftExists();
  await handleDraftFailedModal();

  const runMandatoryCheck = async () => {
    await beforeYouStartPage.startNewIfDraftExists();

    await expect(page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first()).toBeVisible({ timeout: 60000 });

    // Attempt to proceed WITHOUT selecting a card type option.
    await beforeYouStartPage.clickSaveAndContinue();

    try {
      // --- Condition 1: Page did not navigate forward ---
      await expect(page).toHaveURL(/\/companioncardapply\/agency-form(?:\?.*)?$/);
      await expect(page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: /contact details/i })).not.toBeVisible();

      // --- Condition 2: Error summary banner is displayed ---
      const errorBanner = page.getByRole('heading', { name: /please review the following errors/i });
      await expect(errorBanner).toBeVisible({ timeout: 10000 });
      await expect(errorBanner).toHaveText('Please review the following errors');
      await expect(page.getByText('Complete all required fields to continue')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Before you start: What are you trying to do?' })).toBeVisible();

      // --- Condition 3: Inline red error message is shown ---
      const inlineError = page.getByText(/what are you trying to do\? is required/i);
      await expect(inlineError).toBeVisible({ timeout: 5000 });
      await expect(inlineError).toHaveText('What are you trying to do? is required');
      await expect(inlineError).toHaveCSS('color', 'rgb(226, 35, 57)');

      testInfo.annotations.push({ type: 'result', description: 'Test Pass - Conditions are met' });
      console.log('✅ Test Pass - Conditions are met');
    } catch {
      throw new Error('Test Fail - Conditions are not met');
    }
  };

  let attempts = 0;
  while (true) {
    try {
      await runMandatoryCheck();
      break;
    } catch (error: any) {
      if (error.message === 'DraftDeleted' && attempts < 2) {
        attempts++;
        console.log(`Draft deleted, restarting BYS check (attempt ${attempts})...`);
        continue;
      }
      throw error;
    }
  }

  // --- Unique timestamped screenshot at end of test, after all BYS validation errors are visible ---
  const path = require('path');
  const fs = require('fs');
  const screenshotDir = path.resolve(__dirname, '../../../../test-results');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(screenshotDir, `BYSMandatoryCheck_ValidationErrors_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('BYS validation errors screenshot saved at: ' + screenshotPath);
});


