import { test, expect, Locator, Page } from '@playwright/test';
import { AgencyFormPage } from '../../../pages/CC Apply/AgencyForm.page';
import { BeforeYouStartPage } from '../../../pages/CC Apply/BeforeYouStart.page';
import { getLoginIdentityForSpec } from '../../test-data/centralizedTestData';
import { environment } from '../../config/environment';

const failValidation = (num: number): never => {
  throw new Error(`Validation ${num} - Fail`);
};

const fillIfVisible = async (locator: Locator, value: string) => {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.fill(value);
};

const fillContactForm = async (
  page: Page,
  data: {
    firstName: string;
    middleName?: string;
    lastName: string;
    relationship: string;
    describeRelationship?: string;
    describeValidationNumber?: number;
    email: string;
    phone: string;
  }
) => {
  const contactForm = page.locator('li').filter({
    has: page.getByRole('button', { name: /save details/i }),
  }).last();

  await fillIfVisible(contactForm.getByRole('textbox', { name: /^First name\b/i }).first(), data.firstName);
  if (data.middleName) {
    const middleName = contactForm.getByRole('textbox', { name: /Middle name/i }).first();
    if (await middleName.isVisible().catch(() => false)) {
      await middleName.fill(data.middleName);
    }
  }
  await fillIfVisible(contactForm.getByRole('textbox', { name: /^Last name\b/i }).first(), data.lastName);

  const relationshipGroup = contactForm.getByRole('radiogroup', { name: /Relationship to applicant/i }).first();
  const relationshipGroupVisible = await relationshipGroup.isVisible().catch(() => false);
  if (relationshipGroupVisible) {
    const relationshipOption = relationshipGroup.getByRole('radio', {
      name: new RegExp(data.relationship, 'i'),
    }).first();
    await relationshipOption.check().catch(async () => relationshipOption.click());
  } else {
    await fillIfVisible(contactForm.getByLabel(/Relationship to applicant/i).first(), data.relationship);
  }

  if (data.describeRelationship) {
    const describeRelationshipField = contactForm.getByLabel(/Describe the relationship/i).first();
    const describeVisible = await fillIfVisible(describeRelationshipField, data.describeRelationship)
      .then(() => true)
      .catch(() => false);
    if (!describeVisible) {
      throw new Error(`Validation ${data.describeValidationNumber ?? 4} - Fail`);
    }
  }

  await fillIfVisible(contactForm.getByRole('textbox', { name: /^Email address\b/i }).first(), data.email);
  await fillIfVisible(contactForm.getByRole('textbox', { name: /^Phone number\b/i }).first(), data.phone);
  await contactForm.getByRole('button', { name: /save details/i }).click();
};

test('Parent Contacts FO', async ({ page }, testInfo) => {
  test.setTimeout(240000);

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);
  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();
  const contactDetailsHeading = page.getByRole('heading', { name: /contact details/i });
  const loginIdentity = getLoginIdentityForSpec('ParentContactsFO.spec.ts');
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
        `Auth session is not valid for Parent Contacts FO after full ${loginIdentity.provider} login flow. ` +
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

  // Contact Details default landing check.
  await expect(contactDetailsHeading).toBeVisible({ timeout: 60000 });

  const loginQuestion = page.getByText('Who has logged in to complete this application today?');
  if (!(await loginQuestion.isVisible().catch(() => false))) {
    failValidation(1);
  }

  const option1 = page.getByRole('radio', { name: /Myself, the person with a disability/i }).first();
  const option2 = page.getByRole('radio', { name: /A parent, legal guardian, spouse, family member or friend of the person with a disability/i }).first();
  const option3 = page.getByRole('radio', { name: /A professional support provider, paid carer or other representative/i }).first();
  if (!(await option1.isVisible().catch(() => false)) || !(await option2.isVisible().catch(() => false)) || !(await option3.isVisible().catch(() => false))) {
    failValidation(1);
  }

  // Count by matching the known option labels - exactly 3 must be visible
  const visibleOptions = [option1, option2, option3];
  for (const opt of visibleOptions) {
    if (!(await opt.isVisible().catch(() => false))) failValidation(1);
  }
  // Ensure no 4th applicant-type radio exists alongside the known 3
  const allApplicantRadios = page.getByRole('radio', {
    name: /Myself.*disability|parent.*legal guardian|professional support provider/i,
  });
  const totalApplicantTypeOptions = await allApplicantRadios.count().catch(() => 0);
  if (totalApplicantTypeOptions !== 3) {
    failValidation(1);
  }

  // Select "A parent, legal guardian, spouse, family member or friend..." and fill details.
  await option2.check().catch(async () => option2.click());
  await fillIfVisible(page.getByLabel(/First name/i).first(), 'Tom');
  await fillIfVisible(page.getByLabel(/Last name/i).first(), 'Waters');
  await fillIfVisible(page.getByLabel(/Email/i).first(), 'xyz@gmail.com');
  await fillIfVisible(page.getByLabel(/Phone number|Mobile phone number/i).first(), '0401975446');

  // Validation 2: Preferred Contact method should not be visible.
  const preferredMethodHeading = page.getByText(/Preferred contact method|Which method would you like/i).first();
  const preferredEmail = page.getByRole('radio', { name: /^Email$/i }).first();
  const preferredPhone = page.getByRole('radio', { name: /^Phone$/i }).first();
  const preferredMethodVisible = await preferredMethodHeading.isVisible({ timeout: 5000 }).catch(() => false);
  const preferredEmailVisible = await preferredEmail.isVisible({ timeout: 2000 }).catch(() => false);
  const preferredPhoneVisible = await preferredPhone.isVisible({ timeout: 2000 }).catch(() => false);
  if (preferredMethodVisible || preferredEmailVisible || preferredPhoneVisible) {
    failValidation(2);
  }

  // Add Contact 1.
  await handleDraftFailedModal();
  await page.getByRole('button', { name: /Add a Contact/i }).click();
  await fillContactForm(page, {
    firstName: 'Michael',
    middleName: 'Arthur',
    lastName: 'George',
    relationship: 'Friend',
    email: 'xyz@gmail.com',
    phone: '04000000',
  });

  // Validation 3: Contact 1 saved with Edit and Remove.
  const contact1Block = page
    .locator('section, article, div')
    .filter({ hasText: /Michael/ })
    .filter({ hasText: /George/ })
    .first();
  if (
    !(await contact1Block.isVisible({ timeout: 15000 }).catch(() => false)) ||
    !(await page.getByRole('button', { name: /Edit Contact 1/i }).isVisible().catch(() => false)) ||
    !(await page.getByRole('button', { name: /Remove Contact 1/i }).isVisible().catch(() => false))
  ) {
    failValidation(3);
  }

  // Add Contact 2 and Validation 4: Describe relationship appears when Other is selected.
  await handleDraftFailedModal();
  await page.getByRole('button', { name: /Add a Contact/i }).click();
  await fillContactForm(page, {
    firstName: 'Tessa',
    lastName: 'Philip',
    relationship: 'Other',
    describeRelationship: 'Test',
    describeValidationNumber: 4,
    email: 'abc@gmail.com',
    phone: '0413837255',
  });

  // Validation 5: Contact 2 saved with Edit and Remove.
  const contact2Block = page
    .locator('section, article, div')
    .filter({ hasText: /Tessa/ })
    .filter({ hasText: /Philip/ })
    .first();
  if (
    !(await contact2Block.isVisible({ timeout: 15000 }).catch(() => false)) ||
    !(await page.getByRole('button', { name: /Edit Contact 2/i }).isVisible().catch(() => false)) ||
    !(await page.getByRole('button', { name: /Remove Contact 2/i }).isVisible().catch(() => false))
  ) {
    failValidation(5);
  }

  // Validation 6: Add a Contact button must not be visible after two contacts.
  const addContactVisible = await page.getByRole('button', { name: /Add a Contact/i }).isVisible().catch(() => false);
  if (addContactVisible) {
    failValidation(6);
  }


  // Unique timestamped screenshot of Contact Details screen.
  const path = require('path');
  const fs = require('fs');
  const screenshotDir = path.resolve(__dirname, '../../../../test-results');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(screenshotDir, `ParentContactsFO_ContactDetails_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Parent Contacts FO Contact Details screenshot saved at: ' + screenshotPath);

  // Continue and Validation 7: Must proceed to Applicant details.
  await handleDraftFailedModal();
  await agencyFormPage.clickSaveAndContinue();
  const applicantDetailsHeading = page.getByRole('heading', { name: /applicant details/i }).first();
  const movedToApplicantDetails = await applicantDetailsHeading.isVisible({ timeout: 60000 }).catch(() => false);
  if (!movedToApplicantDetails) {
    failValidation(7);
  }

  console.log('✅ Test Pass - Conditions are met');
});



