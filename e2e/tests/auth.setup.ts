import { test as setup, expect } from '@playwright/test';
import { AgencyFormPage } from '../pages/CC Apply/AgencyForm.page';
import { getMappedMyIdEmail } from './test-data/centralizedTestData';

setup.setTimeout(600000);

setup('authenticate and save storage state', async ({ page }) => {
  const agencyFormPage = new AgencyFormPage(page);
  const targetSpecFromEnv = process.env.E2E_AUTH_TARGET_SPEC;
  const targetSpecFromCliArg = process.argv.find((arg) => /\.spec\.ts$/i.test(arg));
  const targetSpec = (targetSpecFromEnv || targetSpecFromCliArg)?.split(/[\\/]/).pop();
  const mappedEmail = targetSpec ? getMappedMyIdEmail(targetSpec) : undefined;
  const email =
    process.env.E2E_MYID_EMAIL ||
    process.env.E2E_TEST_USER_EMAIL ||
    process.env.E2E_AUTH_SETUP_EMAIL ||
    mappedEmail;

  if (!email) {
    throw new Error('No myID email is configured. Set E2E_MYID_EMAIL or run with a mapped spec file.');
  }
  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();

  // Full login flow.
  await agencyFormPage.goToCompanionCardApply();
  await agencyFormPage.ensureNoLoadingError();
  await agencyFormPage.beginApplication();
  await agencyFormPage.continueWithMyId();
  await agencyFormPage.selectMyId();
  await agencyFormPage.enterMyIdEmail(email);
  await agencyFormPage.consentIfRequired();
  await agencyFormPage.navigateToAgencyFormIfNeeded().catch(() => {});

  const reachedBysAutomatically = await bysHeading.isVisible({ timeout: 8000 }).catch(() => false);
  if (!reachedBysAutomatically) {
    console.log('ACTION REQUIRED: Please complete login in the browser to reach Before you start.');
  }

  await expect(bysHeading).toBeVisible({ timeout: 480000 });
});
