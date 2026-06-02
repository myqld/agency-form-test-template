import { test, expect, Locator, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { AgencyFormPage } from '../../../pages/CC Apply/AgencyForm.page';
import { BeforeYouStartPage } from '../../../pages/CC Apply/BeforeYouStart.page';
import { getLoginIdentityForSpec } from '../../test-data/centralizedTestData';
import { ReviewPage } from '../../../pages/CC Apply/Review.page';
import { DeclarationPage } from '../../../pages/CC Apply/Declaration.page';
import { SubmissionPage } from '../../../pages/CC Apply/Submission.page';
import { environment } from '../../config/environment';

type ContactDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  relationship?: string;
};

// Fills the primary (logged-in parent) contact fields — no relationship radio, no preferred contact method.
const fillParentContactDetails = async (page: Page, contact: ContactDetails) => {
  await page.getByRole('textbox', { name: /^First name\b/i }).first().fill(contact.firstName);
  await page.getByRole('textbox', { name: /^Last name\b/i }).first().fill(contact.lastName);
  await page.getByRole('textbox', { name: /^Email address\b|^Email\b/i }).first().fill(contact.email);
  await page.getByRole('textbox', { name: /^Phone number\b|^Mobile phone number\b/i }).first().fill(contact.phone);
};

// Fills an additional contact card (the last "save details" form in the list).
const fillAdditionalContactDetails = async (page: Page, contact: ContactDetails) => {
  const contactForms = page.locator('li').filter({
    has: page.getByRole('button', { name: /save details/i }),
  });
  const contactForm = contactForms.last();
  await contactForm.waitFor({ state: 'visible', timeout: 10000 });

  await contactForm.getByRole('textbox', { name: /^First name\b/i }).first().fill(contact.firstName);
  await contactForm.getByRole('textbox', { name: /^Last name\b/i }).first().fill(contact.lastName);

  if (contact.relationship) {
    const relationshipGroup = contactForm.getByRole('radiogroup', { name: /Relationship to applicant/i }).first();
    const relationshipVisible = await relationshipGroup.isVisible().catch(() => false);
    if (relationshipVisible) {
      const relationshipOption = relationshipGroup
        .getByRole('radio', { name: new RegExp(contact.relationship, 'i') })
        .first();
      await relationshipOption.check().catch(async () => relationshipOption.click());
    } else {
      await contactForm.getByLabel(/Relationship to applicant/i).first().fill(contact.relationship);
    }
  }

  await contactForm.getByRole('textbox', { name: /^Email address\b/i }).first().fill(contact.email);
  await contactForm.getByRole('textbox', { name: /^Phone number\b/i }).first().fill(contact.phone);
  const saveDetailsButton = contactForm.getByRole('button', { name: /save details/i }).first();
  await expect(saveDetailsButton).toBeVisible({ timeout: 10000 });
  await saveDetailsButton.click();
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

test('Review Parent 2 Contacts', async ({ page }, testInfo) => {
  test.setTimeout(600000);

  // Unique timestamped screenshot logic
  const captureStep = async (name: string) => {
    const screenshotsDir = path.resolve('e2e-results', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(screenshotsDir, `${name.replace(/\.[a-z]+$/i, '')}-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot taken: ${screenshotPath}`);
  };

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);
  const reviewPage = new ReviewPage(page);
  const declarationPage = new DeclarationPage(page);
  const submissionPage = new SubmissionPage(page);

  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();
  const contactDetailsHeading = page.getByRole('heading', { name: /contact details/i }).first();
  const applicantDetailsHeading = page.getByRole('heading', { name: /applicant details/i }).first();
  const disabilityDetailsHeading = page.getByRole('heading', { name: /disability details/i }).first();
  const hpAssessmentHeading = page.getByRole('heading', { name: /health professional assessment/i }).first();
  const loginIdentity = getLoginIdentityForSpec('ReviewParent2Contacts.spec.ts');
  const loginEmail = loginIdentity.email;
  const agencyFormUrl = `${process.env.DTP_ROOT_URL || 'https://forms.preprod.beta.my.qld.gov.au'}/companioncardapply/agency-form`;
  // Use the image from the test-data/repo-doc-images folder relative to the project root
  const uploadPngPath = path.resolve(__dirname, '../../test-data/repo-doc-images/image1.png');

  const handleAnyDraftModal = async () => {
    if (page.isClosed()) {
      return false;
    }

    const draftFailedHeading = page.getByRole('heading', { name: /your draft failed to load/i });
    const draftFailedVisible = await draftFailedHeading.isVisible({ timeout: 1000 }).catch(() => false);
    if (draftFailedVisible) {
      const backToStart = page.getByRole('button', { name: /back to start/i }).first();
      if (await backToStart.isVisible({ timeout: 1000 }).catch(() => false)) {
        await backToStart.click();
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      }
      return true;
    }

    const draftDialog = page.getByRole('alertdialog', { name: /you have a draft form/i });
    const draftDialogVisible = await draftDialog.isVisible({ timeout: 1000 }).catch(() => false);
    if (draftDialogVisible) {
      const startNewButton = page.getByRole('button', { name: /start new/i }).first();
      if (await startNewButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await startNewButton.click({ force: true }).catch(() => {});
      }

      await Promise.race([
        draftDialog.waitFor({ state: 'hidden', timeout: 15000 }),
        beforeYouStartPage.beforeYouStartHeading.waitFor({ state: 'visible', timeout: 15000 }),
      ]).catch(() => {});

      return true;
    }

    return false;
  };

  const resumeLoginIfShown = async () => {
    const loginHeading = page.getByRole('heading', { name: /login to continue/i });
    const loginVisible = await loginHeading.isVisible({ timeout: 1500 }).catch(() => false);
    if (!loginVisible) return;

    await agencyFormPage.loginWithIdentity(loginIdentity.provider, loginEmail);
  };

  // NOTE: Avoid global draft-modal handlers because they can trigger during navigation
  // and race with page/context lifecycle. Handle draft modals explicitly at stable checkpoints.
  await page.addLocatorHandler(
    page.getByRole('heading', { name: /login to continue/i }),
    async () => { await resumeLoginIfShown(); }
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
    await handleAnyDraftModal();
    await beforeYouStartPage.startNewIfDraftExists();
    await handleAnyDraftModal();
    await beforeYouStartPage.selectApplyForNewCard();
    await captureStep('01-before-you-start.png');
    await beforeYouStartPage.clickSaveAndContinue();
    await handleAnyDraftModal();
  };

  const ensureBysWithFreshMyIdLogin = async () => {
    await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' });
    await agencyFormPage.ensureNoLoadingError();
    await handleAnyDraftModal();

    const alreadyAtBys = await waitForBysOrDraft(8000);
    if (alreadyAtBys) {
      return;
    }

    const recovered = await recoverAuthIfNeeded();
    await handleAnyDraftModal();

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
    await handleAnyDraftModal();

    const bysVisible = await waitForBysOrDraft(180000);
    if (!bysVisible) {
      throw new Error(
        `Auth session is not valid for Review Parent 2 Contacts after full ${loginIdentity.provider} login flow. ` +
        `Timed out waiting for Before You Start after identity login. Current URL: ${page.url()}.`
      );
    }
  };

  // Stable auth entry: use env/mapped myID email and recover login inline when needed.
  await ensureBysWithFreshMyIdLogin();
  await beforeYouStartPage.startNewIfDraftExists();
  await handleAnyDraftModal();

  await goFromBysToContactDetails();

  const onContactDetails = await contactDetailsHeading.isVisible({ timeout: 8000 }).catch(() => false);
  if (!onContactDetails) {
    const recovered = await recoverAuthIfNeeded();
    if (recovered) await goFromBysToContactDetails();
  }

  await expect(contactDetailsHeading).toBeVisible({ timeout: 60000 });

  // ─── Contact Details (Parent flow) ─────────────────────────────────────────
  // Select "A parent, legal guardian..." radio.
  const parentOption = page
    .getByRole('radio', { name: /a parent, legal guardian, spouse, family member or friend of the person with a disability/i })
    .first();
  await parentOption.check().catch(async () => parentOption.click());

  const primaryContact: ContactDetails = {
    firstName: 'Tom',
    lastName: 'Waters',
    email: 'xyz@gmail.com',
    phone: '0401975446',
  };
  const additionalContacts: ContactDetails[] = [
    {
      firstName: 'Michael',
      lastName: 'George',
      email: 'xyz@gmail.com',
      phone: '04000000',
      relationship: 'Parent',
    },
    {
      firstName: 'Tessa',
      lastName: 'Philip',
      email: 'abc@gmail.com',
      phone: '0413837255',
      relationship: 'Legal Guardian',
    },
  ];
  const contactsAdded: ContactDetails[] = [primaryContact, ...additionalContacts];

  await fillParentContactDetails(page, primaryContact);

  // Preferred contact method must NOT be visible for parent login (unlike Myself flow).
  const preferredContactMethod = page.getByText(/preferred contact method|which method would you like/i).first();
  const preferredVisible = await preferredContactMethod.isVisible({ timeout: 3000 }).catch(() => false);
  expect(preferredVisible, 'Preferred contact method should not be visible for parent login').toBeFalsy();

  const clickAddContact = async () => {
    const addContactButton = page.getByRole('button', { name: /add a contact|add another contact/i }).first();
    const addContactLink = page.getByRole('link', { name: /add a contact|add another contact/i }).first();
    const addContactText = page.getByText(/add a contact|add another contact/i).first();

    if (await addContactButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addContactButton.scrollIntoViewIfNeeded().catch(() => {});
      await addContactButton.click();
      return;
    }
    if (await addContactLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addContactLink.scrollIntoViewIfNeeded().catch(() => {});
      await addContactLink.click();
      return;
    }
    await addContactText.scrollIntoViewIfNeeded().catch(() => {});
    await addContactText.click();
  };

  const saveDetailsButtons = page.getByRole('button', { name: /save details/i });
  for (const contact of additionalContacts) {
    const countBefore = await saveDetailsButtons.count();
    await clickAddContact();
    await expect(saveDetailsButtons).toHaveCount(countBefore + 1, { timeout: 15000 });
    await page.waitForTimeout(800);
    await fillAdditionalContactDetails(page, contact);

    const savedBlock = page
      .locator('section, article, div, li')
      .filter({ hasText: new RegExp(contact.firstName, 'i') })
      .filter({ hasText: new RegExp(contact.lastName, 'i') })
      .first();
    await expect(savedBlock).toBeVisible({ timeout: 15000 });
  }

  const addContactStillVisible =
    (await page.getByRole('button', { name: /add a contact|add another contact/i }).first().isVisible().catch(() => false)) ||
    (await page.getByRole('link', { name: /add a contact|add another contact/i }).first().isVisible().catch(() => false));
  expect(addContactStillVisible).toBeFalsy();
  await captureStep('02-contact-details.png');

  await agencyFormPage.clickSaveAndContinue();
  await expect(applicantDetailsHeading).toBeVisible({ timeout: 60000 });

  // ─── Applicant Details (Parent flow) ───────────────────────────────────────
  // "Are you the person applying for the card?" → Yes
  const yesOption = page.getByRole('radio', { name: /^Yes$/i }).first();
  await yesOption.check().catch(async () => yesOption.click());

  const applicantFirstName = 'Michael';
  const applicantMiddleName = 'Arthur';
  const applicantLastName = 'George';
  const applicantDobDay = '22';
  const applicantDobMonth = '12';
  const applicantDobYear = '1993';
  const residentialAddressValue = '10 SEATTLE CL SPRING MOUNTAIN QLD 4300';
  const postalAddressValue = '18 MIAMI ST SPRING MOUNTAIN QLD 4300';

  const selectAddressFromDropdown = async (combobox: Locator, value: string) => {
    await expect(combobox).toBeVisible({ timeout: 15000 });
    await combobox.click();
    await combobox.fill(value);

    const listboxId = await combobox.getAttribute('aria-controls');
    const options = listboxId
      ? page.locator(
          `[id="${listboxId}"] [role="option"], [id="${listboxId}"] li, [id="${listboxId}"] [id*="option"]`
        )
      : page.locator('[role="listbox"] [role="option"], [role="listbox"] li, [id*="option"]');

    await expect(options.first()).toBeVisible({ timeout: 10000 });
    await options.first().click({ force: true });
    await expect(combobox).toHaveValue(/.+/i, { timeout: 15000 });
  };

  // Parent flow: fill Email address (optional) and Phone number (optional) fields for the applicant.
  const optionalEmailInput = page.getByRole('textbox', { name: /Email address\s*\(optional\)/i }).first();
  const optionalEmailVisible = await optionalEmailInput.isVisible({ timeout: 3000 }).catch(() => false);
  if (optionalEmailVisible) {
    await optionalEmailInput.fill('xyz@gmail.com');
  }

  const optionalPhoneInput = page.getByRole('textbox', { name: /Phone number\s*\(optional\)/i }).first();
  const optionalPhoneVisible = await optionalPhoneInput.isVisible({ timeout: 3000 }).catch(() => false);
  if (optionalPhoneVisible) {
    await optionalPhoneInput.fill('0401975446');
  }

  await page.getByRole('textbox', { name: /^First name\b/i }).first().fill(applicantFirstName);
  await page.getByRole('textbox', { name: /Middle name \(optional\)/i }).first().fill(applicantMiddleName);
  await page.getByRole('textbox', { name: /^Last name\b/i }).first().fill(applicantLastName);

  const dobParts = page.getByRole('spinbutton', { name: 'Date of birth' });
  await dobParts.nth(0).fill(applicantDobDay);
  await dobParts.nth(1).fill(applicantDobMonth);
  await dobParts.nth(2).fill(applicantDobYear);

  const residentialAddress = page.getByRole('combobox', { name: /Residential address/i }).first();
  const residentialCurrentValue = (await residentialAddress.inputValue().catch(() => '')).trim();
  if (!residentialCurrentValue) {
    await selectAddressFromDropdown(residentialAddress, residentialAddressValue);
  }
  await expect(residentialAddress).toHaveValue(/.+/i, { timeout: 15000 });
  // Capture actual displayed value after dropdown selection (may differ in case/abbreviation from typed string).
  const residentialActualValue = (await residentialAddress.inputValue().catch(() => residentialAddressValue)).trim() || residentialAddressValue;

  const differentAddressCheckbox = page.getByRole('checkbox', { name: /send my companion card to a different address/i }).first();
  const differentCheckedBefore = await differentAddressCheckbox.isChecked().catch(() => false);
  if (!differentCheckedBefore) {
    await differentAddressCheckbox.check();
  }

  const whereSendCombobox = page.locator('input[id*="applicantPostalAddressForCard-search-input"]').first();
  await expect(whereSendCombobox).toBeVisible({ timeout: 15000 });
  await whereSendCombobox.click();
  await whereSendCombobox.fill(postalAddressValue);

  const whereSendOptions = page.locator(
    '[id*="applicantPostalAddressForCard-listbox"] [role="option"], [id*="applicantPostalAddressForCard-listbox"] li, [id*="applicantPostalAddressForCard-listbox"] [id*="option"]'
  );
  await expect(whereSendOptions.first()).toBeVisible({ timeout: 10000 });
  await whereSendOptions.first().click({ force: true });
  const postalActualValue = (await whereSendCombobox.inputValue().catch(() => postalAddressValue)).trim() || postalAddressValue;

  // Use robust file upload logic (same as MyselfApplicant.spec.ts)
  const browseFilesButton = page.getByRole('button', { name: /browse files/i }).first();
  await expect(browseFilesButton).toBeVisible({ timeout: 15000 });
  await browseFilesButton.click();
  // Wait for the file input to be attached to the DOM after clicking
  const fileInput = page.locator('input[type="file"]');
  await fileInput.waitFor({ state: 'attached', timeout: 5000 });
  await fileInput.setInputFiles(uploadPngPath);

  const applicantPhotoFileName = 'image1.png';
  await expect(page.getByRole('button', { name: new RegExp(applicantPhotoFileName, 'i') }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/upload complete/i).first()).toBeVisible({ timeout: 20000 });

  const verificationCheckbox = page
    .getByRole('checkbox', { name: /i confirm that the uploaded photo has been sighted and verified by my health professional\./i })
    .first();
  await verificationCheckbox.check().catch(async () => verificationCheckbox.click());
  await expect(verificationCheckbox).toBeChecked({ timeout: 10000 });
  await captureStep('03-applicant-details.png');

  await agencyFormPage.clickSaveAndContinue();
  let onDisabilityDetails = await disabilityDetailsHeading.isVisible({ timeout: 8000 }).catch(() => false);
  if (!onDisabilityDetails) {
    const applicantStillVisible = await applicantDetailsHeading.isVisible({ timeout: 3000 }).catch(() => false);
    const reviewErrorsVisible = await page
      .getByText(/please review the following errors/i)
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    const residentialErrorVisible = await page
      .getByText(/applicant details:\s*residential address/i)
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    // If applicant page is still active with residential-address validation, reselect and retry once.
    if (applicantStillVisible && (reviewErrorsVisible || residentialErrorVisible)) {
      await selectAddressFromDropdown(residentialAddress, residentialAddressValue);
      await expect(residentialAddress).toHaveValue(/.+/i, { timeout: 15000 });

      await agencyFormPage.clickSaveAndContinue();
      onDisabilityDetails = await disabilityDetailsHeading.isVisible({ timeout: 12000 }).catch(() => false);
    }
  }

  if (!onDisabilityDetails) {
    const validationText = await page
      .locator('body')
      .innerText()
      .then((text) => text.slice(0, 1200))
      .catch(() => 'Unable to read page text for validation diagnostics.');
    throw new Error(`Could not proceed to Disability details. Applicant page validation likely blocked submission. Page snapshot: ${validationText}`);
  }

  await expect(disabilityDetailsHeading).toBeVisible({ timeout: 60000 });

  // ─── Disability Details ─────────────────────────────────────────────────────
  const disabilityDiagnosis = 'handicapped';
  const diagnosisDayValue = '01';
  const diagnosisMonthValue = '01';
  const diagnosisYearValue = '2000';
  const additionalNotes = 'test';

  await page.getByRole('textbox', { name: /describe your formally diagnosed disability/i }).first().fill(disabilityDiagnosis);
  await page.getByRole('group', { name: /estimated date of diagnosis|date of diagnosis/i }).getByPlaceholder('dd').fill(diagnosisDayValue);
  await page.getByRole('group', { name: /estimated date of diagnosis|date of diagnosis/i }).getByPlaceholder('mm').fill(diagnosisMonthValue);
  await page.getByRole('group', { name: /estimated date of diagnosis|date of diagnosis/i }).getByPlaceholder('yyyy').fill(diagnosisYearValue);

  await page.getByRole('radiogroup', { name: /do you need help getting around\?/i }).getByRole('radio', { name: /^Yes$/i }).check();
  await page.getByRole('radiogroup', { name: /do you need help with communication\?/i }).getByRole('radio', { name: /^Yes$/i }).check();
  await page
    .getByRole('radiogroup', { name: /do you need help with self-care and daily living tasks when you are out and about\?/i })
    .getByRole('radio', { name: /^Yes$/i })
    .check();
  await page
    .getByRole('radiogroup', { name: /do you need help with planning and managing decisions\?/i })
    .getByRole('radio', { name: /^Yes$/i })
    .check();

  await page.getByRole('textbox', { name: /is there anything else you'd like us to know/i }).first().fill(additionalNotes);
  await captureStep('04-disability-details.png');

  await agencyFormPage.clickSaveAndContinue();
  await expect(hpAssessmentHeading).toBeVisible({ timeout: 60000 });

  // ─── HP Assessment ──────────────────────────────────────────────────────────
  const hpBrowseFilesButton = page.getByRole('button', { name: /browse files/i }).first();
  await expect(hpBrowseFilesButton).toBeVisible({ timeout: 15000 });
  const [hpFileChooser] = await Promise.all([page.waitForEvent('filechooser'), hpBrowseFilesButton.click()]);
  await hpFileChooser.setFiles(uploadPngPath);

  const hpAssessmentFileName = 'image1.png';
  await expect(page.getByRole('button', { name: new RegExp(hpAssessmentFileName, 'i') }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/upload complete/i).first()).toBeVisible({ timeout: 20000 });
  await captureStep('05-hp-assessment.png');

  await agencyFormPage.clickSaveAndContinue();
  await reviewPage.waitForReviewPage();
  await captureStep('06-review-page.png');

  // ─── Review Screen Validation ───────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: /before you start/i }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('heading', { name: /contact details/i }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('heading', { name: /applicant details/i }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('heading', { name: /disability details/i }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('heading', { name: /health professional assessment/i }).first()).toBeVisible({ timeout: 60000 });

  console.log('\n📋 Review Screen Validation Started\n');

  const isVisibleOrPresent = async (locator: ReturnType<typeof page.getByText>): Promise<boolean> => {
    const visible = await locator.first().isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) return true;
    const count = await locator.count().catch(() => 0);
    return count > 0;
  };

  const hasText = (text: string) => page.getByText(text, { exact: false });

  const hasAnyText = async (...alternatives: string[]): Promise<boolean> => {
    for (const alt of alternatives) {
      if (await isVisibleOrPresent(hasText(alt))) return true;
    }
    return false;
  };

  // Before You Start
  await expect(page.getByRole('heading', { name: /before you start/i }).first()).toBeVisible({ timeout: 10000 });
  expect(
    await isVisibleOrPresent(hasText('Apply for a new card')),
    'BYS: "What are you trying to do?" → "Apply for a new card"'
  ).toBeTruthy();
  console.log(`'Before you start' Validation - Pass`);

  // Contact Details
  await expect(page.getByRole('heading', { name: /contact details/i }).first()).toBeVisible({ timeout: 10000 });
  // Key difference from Myself flow: parent option selected, no preferred contact method shown.
  expect(
    await hasAnyText(
      'A parent, legal guardian',
      'parent, legal guardian, spouse',
      'parent'
    ),
    'Contact Details: "Who has logged in?" → "A parent, legal guardian..." option'
  ).toBeTruthy();

  for (const contact of contactsAdded) {
    expect(
      await isVisibleOrPresent(hasText(contact.firstName)),
      `Contact: firstName "${contact.firstName}" should appear in review`
    ).toBeTruthy();
    expect(
      await isVisibleOrPresent(hasText(contact.lastName)),
      `Contact: lastName "${contact.lastName}" should appear in review`
    ).toBeTruthy();
    expect(
      await isVisibleOrPresent(hasText(contact.email)),
      `Contact: email "${contact.email}" should appear in review`
    ).toBeTruthy();
    expect(
      await isVisibleOrPresent(hasText(contact.phone)),
      `Contact: phone "${contact.phone}" should appear in review`
    ).toBeTruthy();
    if (contact.relationship) {
      expect(
        await isVisibleOrPresent(hasText(contact.relationship)),
        `Contact: relationship "${contact.relationship}" should appear in review`
      ).toBeTruthy();
    }
  }
  console.log(`'Contact Details' Validation - Pass`);

  // Applicant Details
  await expect(page.getByRole('heading', { name: /applicant details/i }).first()).toBeVisible({ timeout: 10000 });
  expect(
    await hasAnyText('Yes', 'Myself', 'the person with a disability'),
    'Applicant Details: applying-for-self answer should appear'
  ).toBeTruthy();
  expect(await isVisibleOrPresent(hasText(applicantFirstName)), `Applicant: firstName "${applicantFirstName}"`).toBeTruthy();
  expect(await isVisibleOrPresent(hasText(applicantMiddleName)), `Applicant: middleName "${applicantMiddleName}"`).toBeTruthy();
  expect(await isVisibleOrPresent(hasText(applicantLastName)), `Applicant: lastName "${applicantLastName}"`).toBeTruthy();

  const dobString = `${applicantDobDay}/${applicantDobMonth}/${applicantDobYear}`;
  expect(await isVisibleOrPresent(hasText(dobString)), `Applicant: date of birth "${dobString}"`).toBeTruthy();

  const residentialTokens = residentialActualValue.split(' ').filter((t) => t.length >= 3);
  const residentialPass = await residentialTokens.reduce(async (accP, token) => {
    return (await accP) && (await isVisibleOrPresent(hasText(token)));
  }, Promise.resolve(true));
  expect(residentialPass, `Applicant: residential address tokens from "${residentialActualValue}" should appear`).toBeTruthy();

  const postalTokens = postalActualValue.split(' ').filter((t) => t.length >= 3);
  const postalPass = await postalTokens.reduce(async (accP, token) => {
    return (await accP) && (await isVisibleOrPresent(hasText(token)));
  }, Promise.resolve(true));
  expect(postalPass, `Applicant: card delivery address tokens from "${postalActualValue}" should appear`).toBeTruthy();

  expect(await isVisibleOrPresent(hasText(applicantPhotoFileName)), `Applicant: photo "${applicantPhotoFileName}"`).toBeTruthy();
  console.log(`'Applicant Details' Validation - Pass`);

  // Disability Details
  await expect(page.getByRole('heading', { name: /disability details/i }).first()).toBeVisible({ timeout: 10000 });
  expect(await isVisibleOrPresent(hasText(disabilityDiagnosis)), `Disability: diagnosis "${disabilityDiagnosis}"`).toBeTruthy();

  const diagnosisDateString = `${diagnosisDayValue}/${diagnosisMonthValue}/${diagnosisYearValue}`;
  expect(await isVisibleOrPresent(hasText(diagnosisDateString)), `Disability: diagnosis date "${diagnosisDateString}"`).toBeTruthy();

  expect(
    await isVisibleOrPresent(hasText('Yes')),
    'Disability: at least one "Yes" answer should appear for support need questions'
  ).toBeTruthy();

  expect(await isVisibleOrPresent(hasText(additionalNotes)), `Disability: additional notes "${additionalNotes}"`).toBeTruthy();
  console.log(`'Disability Details' Validation - Pass`);

  // HP Assessment
  await expect(page.getByRole('heading', { name: /health professional assessment/i }).last()).toBeVisible({ timeout: 10000 });
  expect(await isVisibleOrPresent(hasText(hpAssessmentFileName)), `HP Assessment: file "${hpAssessmentFileName}"`).toBeTruthy();
  console.log(`'Health professional assessment' Validation - Pass`);

  await page.screenshot({ path: testInfo.outputPath('review-parent-2contacts-review.png'), fullPage: true });

  // ─── Declaration & Submission ───────────────────────────────────────────────
  await reviewPage.continueToDeclaration();
  await declarationPage.waitForDeclarationPage();
  await declarationPage.confirmDeclarations();
  await declarationPage.submitApplication();
  await submissionPage.waitForSubmissionPage();

  const generatedId = await submissionPage.getGeneratedId();
  expect(generatedId).toBeDefined();
  expect(generatedId).toMatch(/^CCN/i);

  await page.screenshot({ path: testInfo.outputPath('review-parent-2contacts-submission.png'), fullPage: true });

  console.log(`✅ Validation Pass - Generated ID starts with CCN: ${generatedId}`);
});



