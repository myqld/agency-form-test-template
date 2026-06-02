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
    requireDropdownSelection?: boolean;
  }
) => {
  await field.waitFor({ state: 'visible', timeout: 20000 });
  const page = field.page();
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

  for (const term of searchTerms) {
    await field.click();
    await field.fill('');
    await field.type(term, { delay: 25 });
    await field.press('ArrowDown').catch(() => {});

    const visibleOptions = getVisibleOptions();
    const hasAnyOption = await visibleOptions.first().isVisible({ timeout: 8000 }).catch(() => false);
    if (!hasAnyOption) {
      continue;
    }

    await visibleOptions.first().click({ force: true });
    return;
  }

  await field.press('ArrowDown').catch(() => {});
  await field.press('Enter').catch(() => {});
  await field.blur().catch(() => {});

  if (options?.requireDropdownSelection === false) {
    return;
  }

  throw new Error('Address dropdown options did not appear.');
};

const expectOneOfVisible = async (locators: Locator[], reason: string): Promise<Locator> => {
  for (const locator of locators) {
    const visible = await locator.isVisible({ timeout: 1500 }).catch(() => false);
    if (visible) {
      return locator;
    }
  }
  throw new Error(reason);
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('Disability Mandatory Check', async ({ page }, testInfo) => {
  test.setTimeout(300000);

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);

  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();
  const contactDetailsHeading = page.getByRole('heading', { name: /contact details/i }).first();
  const applicantDetailsHeading = page.getByRole('heading', { name: /applicant details/i }).first();
  const disabilityDetailsHeading = page.getByRole('heading', { name: /disability details/i }).first();
  const loginIdentity = getLoginIdentityForSpec('DisabilityMandatoryCheck.spec.ts');
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
        `Auth session is not valid for Disability Mandatory Check after full ${loginIdentity.provider} login flow. ` +
        `Timed out waiting for Before You Start after identity login. Current URL: ${page.url()}.`
      );
    }
  };

  // Stable auth entry: use env/mapped myID email and recover login inline when needed.
  await ensureBysWithFreshMyIdLogin();
  await beforeYouStartPage.startNewIfDraftExists();
  await handleDraftFailedModal();

  await goFromBysToContactDetails();

  const onContactDetails = await contactDetailsHeading.isVisible({ timeout: 8000 }).catch(() => false);
  if (!onContactDetails) {
    const recovered = await recoverAuthIfNeeded();
    if (recovered) {
      await goFromBysToContactDetails();
    }
  }

  await expect(contactDetailsHeading).toBeVisible({ timeout: 60000 });

  const myselfOption = page.getByRole('radio', { name: /myself, the person with a disability/i }).first();
  await myselfOption.check().catch(async () => myselfOption.click());
  await fillRequiredContactDetails(page);

  await agencyFormPage.clickSaveAndContinue();
  await expect(applicantDetailsHeading).toBeVisible({ timeout: 60000 });

  const yesOption = page.getByRole('radio', { name: /^Yes$/i }).first();
  await yesOption.check().catch(async () => yesOption.click());

  await page.getByRole('textbox', { name: /^First name\b/i }).first().fill('Michael');
  await page.getByRole('textbox', { name: /Middle name \(optional\)/i }).first().fill('Arthur');
  await page.getByRole('textbox', { name: /^Last name\b/i }).first().fill('George');

  const dobParts = page.getByRole('spinbutton', { name: 'Date of birth' });
  await dobParts.nth(0).fill('22');
  await dobParts.nth(1).fill('12');
  await dobParts.nth(2).fill('1993');

  const residentialAddress = page.getByRole('combobox', { name: /Residential address/i }).first();
  await residentialAddress.click();
  await residentialAddress.fill('10 SEATTLE CL SPRING MOUNTAIN QLD 4300');
  const residentialOptions = page.locator('[role="listbox"] [role="option"], [role="listbox"] li, [id*="option"]');
  await expect(residentialOptions.first()).toBeVisible({ timeout: 10000 });
  const seattleOption = residentialOptions.filter({ hasText: /10\s+SEATTLE\s+CL/i }).first();
  if (await seattleOption.isVisible({ timeout: 1000 }).catch(() => false)) {
    await seattleOption.click({ force: true });
  } else {
    await residentialOptions.first().click({ force: true });
  }
  await expect(residentialAddress).toHaveValue(/10 SEATTLE CL SPRING MOUNTAIN QLD 4300/i, { timeout: 15000 });

  const differentAddressCheckbox = page.getByRole('checkbox', { name: /send my companion card to a different address/i }).first();
  const differentCheckedBefore = await differentAddressCheckbox.isChecked().catch(() => false);
  if (!differentCheckedBefore) {
    await differentAddressCheckbox.check();
  }

  const whereSendCombobox = page.locator('input[id*="applicantPostalAddressForCard-search-input"]').first();
  await expect(whereSendCombobox).toBeVisible({ timeout: 15000 });
  await whereSendCombobox.click();
  await whereSendCombobox.fill('18 MIAMI ST SPRING MOUNTAIN QLD 4300');

  const whereSendOptions = page.locator(
    '[id*="applicantPostalAddressForCard-listbox"] [role="option"], [id*="applicantPostalAddressForCard-listbox"] li, [id*="applicantPostalAddressForCard-listbox"] [id*="option"]'
  );
  await expect(whereSendOptions.first()).toBeVisible({ timeout: 10000 });
  await whereSendOptions.first().click({ force: true });

  // Use robust file upload logic (same as MyselfApplicant.spec.ts)
  const browseFilesButton = page.getByRole('button', { name: /browse files/i }).first();
  await expect(browseFilesButton).toBeVisible({ timeout: 15000 });
  await browseFilesButton.click();
  // Wait for the file input to be attached to the DOM after clicking
  const fileInput = page.locator('input[type="file"]');
  await fileInput.waitFor({ state: 'attached', timeout: 5000 });
  await fileInput.setInputFiles(uploadPngPath);

  await expect(page.getByRole('button', { name: /image1\.png/i }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/upload complete/i).first()).toBeVisible({ timeout: 20000 });

  const verificationCheckbox = page
    .getByRole('checkbox', { name: /i confirm that the uploaded photo has been sighted and verified by my health professional\./i })
    .first();
  await verificationCheckbox.check().catch(async () => verificationCheckbox.click());
  await expect(verificationCheckbox).toBeChecked({ timeout: 10000 });

  await agencyFormPage.clickSaveAndContinue();
  await expect(disabilityDetailsHeading).toBeVisible({ timeout: 60000 });

  await agencyFormPage.clickSaveAndContinue();
  await expect(disabilityDetailsHeading).toBeVisible({ timeout: 15000 });

  const errorBannerHeading = page.getByRole('heading', { name: /please review the following errors/i }).first();
  await expect(errorBannerHeading).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/complete all required fields to continue/i)).toBeVisible({ timeout: 5000 });

  const diagnosisError = await expectOneOfVisible(
    [
      page.getByText(/disability diagnosis.*required/i).first(),
      page.getByText(/describe.*diagnosis.*required/i).first(),
      page.getByRole('link', { name: /disability details:\s*.*diagnosis/i }).first(),
    ],
    'Validation 1 failed: diagnosis required error was not visible.'
  );

  const diagnosisDateError = await expectOneOfVisible(
    [
      page.getByText(/estimated date of diagnosis.*required/i).first(),
      page.getByText(/date of diagnosis.*required/i).first(),
      page.getByRole('link', { name: /disability details:\s*.*date of diagnosis/i }).first(),
    ],
    'Validation 1 failed: date of diagnosis required error was not visible.'
  );

  const supportNeedsError = await expectOneOfVisible(
    [
      page.getByText(/help getting around.*required/i).first(),
      page.getByText(/help with communication.*required/i).first(),
      page.getByText(/help with self\-?care.*required/i).first(),
      page.getByText(/planning and managing decisions.*required/i).first(),
      page.getByRole('link', { name: /disability details:\s*.*help/i }).first(),
    ],
    'Validation 1 failed: one or more support-needs required errors were not visible.'
  );

  const optionalTextNodes = page
    .locator('label:visible, legend:visible, p:visible, span:visible, div:visible')
    .filter({ hasText: /\(optional\)/i });
  const optionalCount = await optionalTextNodes.count();

  for (let i = 0; i < optionalCount; i++) {
    const text = (await optionalTextNodes.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const baseText = text.replace(/\(optional\)/gi, '').replace(/\s+/g, ' ').trim();
    if (!baseText) continue;

    const escapedBaseText = escapeRegex(baseText);
    await expect(page.getByRole('link', { name: new RegExp(escapedBaseText, 'i') }).first()).not.toBeVisible({ timeout: 2000 });
    await expect(page.getByText(new RegExp(`${escapedBaseText}.*required|required.*${escapedBaseText}`, 'i')).first()).not.toBeVisible({
      timeout: 2000,
    });
  }

  await expect(page.getByRole('link', { name: /optional/i }).first()).not.toBeVisible({ timeout: 2000 });

  // Unique timestamped screenshot logic
  const screenshotsDir = path.resolve('e2e-results', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(screenshotsDir, `DisabilityMandatoryCheck-errors-${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot taken: ${screenshotPath}`);

  console.log('✅ Test Pass - Disability mandatory validation banner/inline/red text verified and optional fields have no required errors');
});




