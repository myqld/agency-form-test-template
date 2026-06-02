import { test, expect } from '@playwright/test';
import { AgencyFormPage } from '../../../pages/CC Apply/AgencyForm.page';
import { BeforeYouStartPage } from '../../../pages/CC Apply/BeforeYouStart.page';
import { getLoginIdentityForSpec } from '../../test-data/centralizedTestData';
import { environment } from '../../config/environment';

const failValidation = (num: number): never => {
  throw new Error(`Validation ${num} - Fail`);
};

test('Applicant NS', async ({ page }, testInfo) => {
  test.setTimeout(240000);

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);
  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();
  const contactDetailsHeading = page.getByRole('heading', { name: /contact details/i });
  const loginIdentity = getLoginIdentityForSpec('ApplicantNS.spec.ts');
  const loginEmail = loginIdentity.email;
  const agencyFormUrl = `${process.env.DTP_ROOT_URL || 'https://forms.preprod.beta.my.qld.gov.au'}/companioncardapply/agency-form`;

  const handleDraftFailedModal = async () => {
    const draftFailedHeading = page.getByRole('heading', { name: /your draft failed to load/i });
    const visible = await draftFailedHeading.isVisible({ timeout: 2000 }).catch(() => false);
    if (!visible) return false;

    const backToStart = page.getByRole('button', { name: /back to start/i });
    await backToStart.click();
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

    try {
      await agencyFormPage.ensureNoLoadingError().catch(() => {});
      const reachedBysAfterLogin = await waitForBysOrDraft(180000);
      if (reachedBysAfterLogin) {
        return true;
      }

      await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await agencyFormPage.ensureNoLoadingError().catch(() => {});
      return await waitForBysOrDraft(15000);
    } catch {
      await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await agencyFormPage.ensureNoLoadingError().catch(() => {});
      return await waitForBysOrDraft(15000);
    }
  };

  const goFromBysToContactDetails = async () => {
    await handleDraftFailedModal();
    await beforeYouStartPage.startNewIfDraftExists();
    await handleDraftFailedModal();
    await beforeYouStartPage.selectApplyForNewCard();
    await beforeYouStartPage.clickSaveAndContinue();
    await handleDraftFailedModal();
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
        `Auth session is not valid for Applicant NS after full ${loginIdentity.provider} login flow. ` +
        `Timed out waiting for Before You Start after identity login. Current URL: ${page.url()}.`
      );
    }
  };

  // Stable auth entry: use env/mapped myID email and recover login inline when needed.
  await ensureBysWithFreshMyIdLogin();
  await beforeYouStartPage.startNewIfDraftExists();
  await handleDraftFailedModal();

  // BYS: Apply for a new Card -> Save & Continue
  await goFromBysToContactDetails();

  // If app bounced to login, recover auth and retry once from BYS.
  const onContactDetails = await contactDetailsHeading.isVisible({ timeout: 8000 }).catch(() => false);
  if (!onContactDetails) {
    const recovered = await recoverAuthIfNeeded();
    if (recovered) {
      await goFromBysToContactDetails();
    }
  }

  await handleDraftFailedModal();
  await expect(contactDetailsHeading).toBeVisible({ timeout: 60000 });

  // Select "Myself..." and minimal fill to proceed to Applicant Details.
  const option1 = page.getByRole('radio', { name: /Myself, the person with a disability/i }).first();
  await option1.check().catch(async () => option1.click());

  const firstName = page.getByRole('textbox', { name: /^First name\b/i }).first();
  const lastName = page.getByRole('textbox', { name: /^Last name\b/i }).first();
  const email = page.getByRole('textbox', { name: /^Email address\b|^Email\b/i }).first();
  const phone = page.getByRole('textbox', { name: /^Phone number\b|^Mobile phone number\b/i }).first();

  await firstName.waitFor({ state: 'visible', timeout: 15000 });
  await firstName.fill('Test');
  await lastName.fill('User');
  await email.fill('test@example.com');
  await phone.fill('0401234567');

  const preferredEmail = page.getByRole('radio', { name: /^Email$/i }).first();
  await preferredEmail.check().catch(async () => preferredEmail.click());

  // Click Save & Continue to proceed to Applicant Details.
  await agencyFormPage.clickSaveAndContinue();

  const applicantDetailsHeading = page.getByRole('heading', { name: /applicant details/i }).first();
  await expect(applicantDetailsHeading).toBeVisible({ timeout: 60000 });

  // Validation 1: Validate default landing page content on Applicant Details screen.
  const permanentResidentQuestion = page.getByText(/is the person with a disability a permanent resident of queensland\?/i);
  if (!(await permanentResidentQuestion.isVisible({ timeout: 15000 }).catch(() => false))) {
    failValidation(1);
  }

  const permanentResidentDescription = page.getByText(/a permanent resident of queensland is someone who lives in queensland for more than 6 months of the year/i);
  if (!(await permanentResidentDescription.isVisible({ timeout: 5000 }).catch(() => false))) {
    failValidation(1);
  }

  const yesOption = page.getByRole('radio', { name: /^Yes$/i }).first();
  const noOption = page.getByRole('radio', { name: /^No$/i }).first();
  if (!(await yesOption.isVisible({ timeout: 5000 }).catch(() => false)) || !(await noOption.isVisible({ timeout: 5000 }).catch(() => false))) {
    failValidation(1);
  }

  // Validation 2: Click on "No" and validate error banner and text.
  await noOption.check().catch(async () => noOption.click());

  // Wait for error message and banner to appear.
  const youAreNotEligible = page.getByText(/you are not eligible to continue/i);
  await expect(youAreNotEligible).toBeVisible({ timeout: 10000 });
  await expect(youAreNotEligible).toHaveCSS('color', 'rgb(226, 35, 57)');

  const cannotProgressBanner = page.getByRole('heading', { name: /cannot progress/i }).first();
  await expect(cannotProgressBanner).toBeVisible({ timeout: 10000 });

  const bannerText = page.getByText(/the companion card is only available to queensland permanent residents who live in queensland for more than 6 months of the year/i);
  await expect(bannerText).toBeVisible({ timeout: 5000 });


  // Unique timestamped screenshot at the end.
  const path = require('path');
  const fs = require('fs');
  const screenshotDir = path.resolve(__dirname, '../../../../test-results');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(screenshotDir, `ApplicantNS_ErrorBanner_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Applicant NS error banner screenshot saved at: ' + screenshotPath);

  console.log('✅ Test Pass - Conditions are met');
});



