import { test, expect, Locator, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { AgencyFormPage } from '../../../pages/CC Apply/AgencyForm.page';
import { BeforeYouStartPage } from '../../../pages/CC Apply/BeforeYouStart.page';
import { getLoginIdentityForSpec } from '../../test-data/centralizedTestData';
import { environment } from '../../config/environment';

const fillRequiredContactDetails = async (page: Page) => {
  await page.getByRole('textbox', { name: /^First name\b/i }).first().fill('Tom');
  await page.getByRole('textbox', { name: /^Last name\b/i }).first().fill('Waters');
  await page.getByRole('textbox', { name: /^Email address\b|^Email\b/i }).first().fill('xyz@gmail.com');
  await page.getByRole('textbox', { name: /^Phone number\b|^Mobile phone number\b/i }).first().fill('0401975446');

  const preferredEmail = page.getByRole('radio', { name: /^Email$/i }).first();
  const preferredVisible = await preferredEmail.isVisible({ timeout: 3000 }).catch(() => false);
  if (preferredVisible) {
    await preferredEmail.check().catch(async () => preferredEmail.click());
  }
};

const setAddressValue = async (
  field: Locator,
  value: string,
  options?: {
    searchTerms?: string[];
    allowPrefilledMatch?: boolean;
    requireDropdownSelection?: boolean;
    acceptValueContains?: string;
  }
) => {
  await field.waitFor({ state: 'visible', timeout: 20000 });
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  const expectedValue = normalize(value);

  if (options?.allowPrefilledMatch) {
    const currentValue = normalize(await field.inputValue().catch(() => ''));
    if (currentValue === expectedValue || currentValue.includes(expectedValue) || expectedValue.includes(currentValue)) {
      return;
    }
  }

  const page = field.page();
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchTerms = options?.searchTerms && options.searchTerms.length > 0 ? options.searchTerms : [value];
  const listboxId = await field.getAttribute('aria-controls');

  const getVisibleOptions = () => {
    if (listboxId) {
      return page.locator(
        `[id="${listboxId}"] [role="option"]:visible, [id="${listboxId}"] li:visible, [id="${listboxId}"] [id*="option"]:visible`
      );
    }
    return page.locator('[role="listbox"] [role="option"]:visible, [role="listbox"] li:visible, [id*="option"]:visible');
  };

  const getFallbackListboxItems = () => {
    if (listboxId) {
      return page.locator(
        `[id="${listboxId}"] > *:visible, [id="${listboxId}"] [data-option-index]:visible, [id="${listboxId}"] [id*="-option-"]:visible`
      );
    }
    return page.locator('[role="listbox"] > *:visible, [role="listbox"] [data-option-index]:visible');
  };

  for (const term of searchTerms) {
    await field.click();
    await field.fill('');
    await field.type(term, { delay: 25 });
    await field.press('ArrowDown').catch(() => {});

    const visibleOptions = getVisibleOptions();
    const exactVisibleOption = visibleOptions.filter({ hasText: new RegExp(`^\\s*${escapedValue}\\s*$`, 'i') }).first();
    const hasAnyOption = await visibleOptions.first().isVisible({ timeout: 8000 }).catch(() => false);
    if (!hasAnyOption) {
      continue;
    }

    if (await exactVisibleOption.isVisible({ timeout: 1000 }).catch(() => false)) {
      await exactVisibleOption.click({ force: true });
      return;
    }

    await visibleOptions.first().click({ force: true });
    return;
  }

  const fallbackItems = getFallbackListboxItems();
  if (await fallbackItems.first().isVisible({ timeout: 1000 }).catch(() => false)) {
    await fallbackItems.first().click({ force: true });
    return;
  }

  await field.press('ArrowDown').catch(() => {});
  await field.press('Enter').catch(() => {});
  await field.blur().catch(() => {});
  const currentAfterKeyboardSelect = normalize(await field.inputValue().catch(() => ''));
  if (currentAfterKeyboardSelect.includes('18 miami st')) {
    return;
  }

  if (!options?.requireDropdownSelection) {
    const currentValue = normalize(await field.inputValue().catch(() => ''));
    if (currentValue === expectedValue || currentValue.includes(expectedValue)) {
      return;
    }
  }

  if (options?.acceptValueContains) {
    const currentValue = normalize(await field.inputValue().catch(() => ''));
    const acceptedToken = normalize(options.acceptValueContains);
    if (currentValue.includes(acceptedToken)) {
      return;
    }
  }

  if (options?.requireDropdownSelection === false) {
    return;
  }

  throw new Error('Address dropdown options did not appear.');
};

test('Myself Applicant', async ({ page }) => {
  test.setTimeout(300000);

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);
  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();
  const contactDetailsHeading = page.getByRole('heading', { name: /contact details/i }).first();
  const applicantDetailsHeading = page.getByRole('heading', { name: /applicant details/i }).first();
  const disabilityDetailsHeading = page.getByRole('heading', { name: /disability details/i }).first();
  const loginIdentity = getLoginIdentityForSpec('MyselfApplicant.spec.ts');
  const loginEmail = loginIdentity.email;
  const agencyFormUrl = `${process.env.DTP_ROOT_URL || 'https://forms.preprod.beta.my.qld.gov.au'}/companioncardapply/agency-form`;
  // Use the image from the test-data/repo-doc-images folder relative to the project root
  const uploadPngPath = path.resolve(__dirname, '../../test-data/repo-doc-images/image1.png');

  const handleDraftFailedModal = async () => {
    const draftFailedHeading = page.getByRole('heading', { name: /your draft failed to load/i });
    const visible = await draftFailedHeading.isVisible({ timeout: 2000 }).catch(() => false);
    if (!visible) return false;

    await page.getByRole('button', { name: /back to start/i }).click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await draftFailedHeading.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    return true;
  };

  const resumeLoginIfShown = async () => {
    const loginHeading = page.getByRole('heading', { name: /login to continue/i });
    const loginVisible = await loginHeading.isVisible({ timeout: 1500 }).catch(() => false);
    if (!loginVisible) return;

    await agencyFormPage.loginWithIdentity(loginIdentity.provider, loginEmail);
  };

  // NOTE: Avoid global draft-modal handlers because they can trigger during navigation
  // and race with page/context lifecycle. Handle draft modals explicitly at stable checkpoints.
  // Global guard: if session drops to login mid-test, re-run myID continuation steps.
  await page.addLocatorHandler(
    page.getByRole('heading', { name: /login to continue/i }),
    async () => {
      await resumeLoginIfShown();
    }
  );

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
        `Auth session is not valid for Myself Applicant after full ${loginIdentity.provider} login flow. ` +
        `Timed out waiting for Before You Start after identity login. Current URL: ${page.url()}.`
      );
    }
  };

  // Stable auth entry: use env/mapped myID email and recover login inline when needed.
  await ensureBysWithFreshMyIdLogin();
  await beforeYouStartPage.startNewIfDraftExists();
  await handleDraftFailedModal();

  // Reach Contact details
  await goFromBysToContactDetails();

  const onContactDetails = await contactDetailsHeading.isVisible({ timeout: 8000 }).catch(() => false);
  if (!onContactDetails) {
    const recovered = await recoverAuthIfNeeded();
    if (recovered) {
      await goFromBysToContactDetails();
    }
  }

  await expect(contactDetailsHeading).toBeVisible({ timeout: 60000 });

  // Select Myself path and continue to Applicant details.
  const myselfOption = page.getByRole('radio', { name: /myself, the person with a disability/i }).first();
  await myselfOption.check().catch(async () => myselfOption.click());
  await fillRequiredContactDetails(page);

  await agencyFormPage.clickSaveAndContinue();
  await expect(applicantDetailsHeading).toBeVisible({ timeout: 60000 });

  // 1-2. On Applicant Details click Yes.
  const yesOption = page.getByRole('radio', { name: /^Yes$/i }).first();
  await yesOption.check().catch(async () => yesOption.click());

  // 3. Overwrite values regardless of prefill.
  await page.getByRole('textbox', { name: /^First name\b/i }).first().fill('Michael');
  await page.getByRole('textbox', { name: /Middle name \(optional\)/i }).first().fill('Arthur');
  await page.getByRole('textbox', { name: /^Last name\b/i }).first().fill('George');

  const dobParts = page.getByRole('spinbutton', { name: 'Date of birth' });
  await dobParts.nth(0).fill('22');
  await dobParts.nth(1).fill('12');
  await dobParts.nth(2).fill('1993');

  const residentialAddress = page.getByRole('combobox', { name: /Residential address/i }).first();
  const residentialCurrentValue = (await residentialAddress.inputValue().catch(() => '')).trim();
  if (!residentialCurrentValue) {
    await setAddressValue(residentialAddress, '10 SEATTLE CL SPRING MOUNTAIN QLD 4300', {
      searchTerms: ['10 SEATTLE CL SPRING MOUNTAIN QLD 4300'],
      requireDropdownSelection: false
    });
    await expect(residentialAddress).toHaveValue(/10 SEATTLE CL SPRING MOUNTAIN QLD 4300/i, { timeout: 15000 });
  }

  const differentAddressCheckbox = page.getByRole('checkbox', { name: /send my companion card to a different address/i }).first();
  const differentCheckedBefore = await differentAddressCheckbox.isChecked().catch(() => false);
  if (!differentCheckedBefore) {
    await differentAddressCheckbox.check();
  }
  await expect(differentAddressCheckbox).toBeChecked({ timeout: 10000 });

  const whereSendQuestion = page.getByText(/where should we send the companion card\?/i).first();
  await expect(whereSendQuestion).toBeVisible({ timeout: 15000 });
  const whereSendCombobox = page.locator('input[id*="applicantPostalAddressForCard-search-input"]').first();
  await expect(whereSendCombobox).toBeVisible({ timeout: 15000 });
  await whereSendCombobox.click();
  await whereSendCombobox.fill('18 MIAMI ST SPRING MOUNTAIN QLD 4300');

  const whereSendOptions = page.locator(
    '[id*="applicantPostalAddressForCard-listbox"] [role="option"], [id*="applicantPostalAddressForCard-listbox"] li, [id*="applicantPostalAddressForCard-listbox"] [id*="option"]'
  );
  await expect(whereSendOptions.first()).toBeVisible({ timeout: 10000 });

  const miamiOption = whereSendOptions.filter({ hasText: /18\s+MIAMI\s+ST/i }).first();
  if (await miamiOption.isVisible({ timeout: 1000 }).catch(() => false)) {
    await miamiOption.click({ force: true });
  } else {
    await whereSendOptions.first().click({ force: true });
  }
  await expect(whereSendCombobox).toHaveValue(/18 MIAMI ST/i, { timeout: 15000 });
  await expect(page.getByRole('button', { name: /clear where should we send the companion card\?/i }).first()).toBeVisible({ timeout: 15000 });
  await whereSendCombobox.press('Tab').catch(() => {});


  // 4. Upload PNG file robustly.
  const browseFilesButton = page.getByRole('button', { name: /browse files/i }).first();
  await expect(browseFilesButton).toBeVisible({ timeout: 15000 });
  await browseFilesButton.click();
  // Wait for the file input to be attached to the DOM after clicking
  const fileInput = page.locator('input[type="file"]');
  await fileInput.waitFor({ state: 'attached', timeout: 5000 });
  await fileInput.setInputFiles(uploadPngPath);

  await expect(page.getByRole('button', { name: /image1\.png/i }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/upload complete/i).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: /^Delete$/i }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/upload a photo is required/i).first()).not.toBeVisible({ timeout: 20000 });

  // 5. Check photo verification confirmation.
  const verificationCheckbox = page
    .getByRole('checkbox', { name: /i confirm that the uploaded photo has been sighted and verified by my health professional\./i })
    .first();
  await verificationCheckbox.check().catch(async () => verificationCheckbox.click());
  await expect(verificationCheckbox).toBeChecked({ timeout: 10000 });

  const submitApplicantDetails = async () => {
    await agencyFormPage.clickSaveAndContinue();

    const errorBannerHeading = page.getByRole('heading', { name: /please review the following errors/i }).first();
    const reachedDisabilityDetails = await disabilityDetailsHeading.isVisible({ timeout: 15000 }).catch(() => false);
    if (reachedDisabilityDetails) {
      return;
    }

    const hasErrorBanner = await errorBannerHeading.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasErrorBanner) {
      return;
    }

    const whereSendLooksCommitted = await whereSendCombobox.inputValue().then(value => /18 MIAMI ST/i.test(value)).catch(() => false);
    const uploadLooksCommitted = await page.getByText(/upload complete/i).first().isVisible({ timeout: 1000 }).catch(() => false);
    const verificationChecked = await verificationCheckbox.isChecked().catch(() => false);

    if (whereSendLooksCommitted && uploadLooksCommitted && verificationChecked) {
      await agencyFormPage.clickSaveAndContinue();
    }

    const reachedAfterRetry = await disabilityDetailsHeading.isVisible({ timeout: 15000 }).catch(() => false);
    if (reachedAfterRetry) {
      return;
    }

    const bannerText = await errorBannerHeading.locator('xpath=..').innerText().catch(() => 'Validation error banner displayed.');
    throw new Error(`Applicant details did not submit. ${bannerText.replace(/\s+/g, ' ').trim()}`);
  };

  // 6. Save and Continue.
  // Take screenshot after all validation errors (if any) appear, only once, with unique timestamp.
  try {
    await submitApplicantDetails();
  } catch (error) {
    // After validation errors appear, take a unique screenshot
    const screenshotsDir = path.resolve('e2e-results', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(screenshotsDir, `MyselfApplicant-validation-error-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot taken: ${screenshotPath}`);
    throw error; // rethrow to fail the test as intended
  }

  // 7. Disability details should be shown.
  await expect(disabilityDetailsHeading).toBeVisible({ timeout: 60000 });

  // Take a unique screenshot after all validation errors (if any) and successful navigation
  const screenshotsDir = path.resolve('e2e-results', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(screenshotsDir, `MyselfApplicant-success-${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot taken: ${screenshotPath}`);

  console.log('✅ Test Pass - Disability details screen is displayed');
});



