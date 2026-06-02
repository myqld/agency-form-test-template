import { test, expect } from '@playwright/test';
import { AgencyFormPage } from '../../../pages/CC Apply/AgencyForm.page';
import { ApplicantDetailsPage } from '../../../pages/CC Apply/ApplicantDetails.page';
import { BeforeYouStartPage } from '../../../pages/CC Apply/BeforeYouStart.page';
import { ContactDetailsPage } from '../../../pages/CC Apply/ContactDetails.page';
import { DeclarationPage } from '../../../pages/CC Apply/Declaration.page';
import { DisabilityDetailsPage } from '../../../pages/CC Apply/DisabilityDetails.page';
import { HealthProfessionalAssessmentPage } from '../../../pages/CC Apply/HealthProfessionalAssessment.page';
import { ReviewPage } from '../../../pages/CC Apply/Review.page';
import { SubmissionPage } from '../../../pages/CC Apply/Submission.page';

test('Companion Card: myID flow to submission', async ({ page }) => {
  test.setTimeout(180000);

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);
  const contactDetailsPage = new ContactDetailsPage(page);
  const applicantDetailsPage = new ApplicantDetailsPage(page);
  const disabilityDetailsPage = new DisabilityDetailsPage(page);
  const assessmentPage = new HealthProfessionalAssessmentPage(page);
  const reviewPage = new ReviewPage(page);
  const declarationPage = new DeclarationPage(page);
  const submissionPage = new SubmissionPage(page);

  const applicantPhotoFile = {
    name: 'applicant-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==', 'base64'),
  };

  const assessmentDocumentFile = {
    name: 'health-professional-assessment.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPJ4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQo+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDQKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjE5MAolJUVPRgo=',
      'base64'
    ),
  };

  await agencyFormPage.goToCompanionCardApply();
  await agencyFormPage.ensureNoLoadingError();
  await agencyFormPage.beginApplication();
  await agencyFormPage.continueWithMyId();
  await agencyFormPage.selectMyId();
  await agencyFormPage.enterMyIdEmail('IndustryRDTI27@test.gov.au');
  await agencyFormPage.consentIfRequired();
  await agencyFormPage.navigateToAgencyFormIfNeeded();
  await agencyFormPage.ensureNoLoadingError();

  const runFormSteps = async () => {
    await beforeYouStartPage.completeBeforeYouStart();
    await contactDetailsPage.expectCurrentHeading(/contact details/i);
    await contactDetailsPage.completeMyIdContactDetails();
    await contactDetailsPage.clickSaveAndContinue();

    const stillOnContactDetails = await page.getByRole('heading', { name: /contact details/i }).isVisible().catch(() => false);
    if (stillOnContactDetails) {
      await page.getByRole('radio', { name: /^Email$/i }).first().check().catch(async () => {
        await page.getByText('Email', { exact: true }).last().click();
      });
      await contactDetailsPage.clickSaveAndContinue();
    }

    await applicantDetailsPage.waitForApplicantDetailsPage();
    await applicantDetailsPage.selectPermanentResident(true);
    await applicantDetailsPage.fillDateOfBirth('1', '1', '2000');
    await applicantDetailsPage.uploadApplicantPhoto(applicantPhotoFile);
    await applicantDetailsPage.verifyApplicantPhoto();
    await applicantDetailsPage.clickSaveAndContinue();

    const conditionDescription = page.locator('textarea').first();
    const movedToDisabilityPage = await conditionDescription.isVisible({ timeout: 10000 }).catch(() => false);
    if (!movedToDisabilityPage) {
      await expect(page.getByText(/upload complete/i)).toBeVisible({ timeout: 30000 });
      await applicantDetailsPage.clickSaveAndContinue();
    }

    await expect(conditionDescription).toBeVisible({ timeout: 60000 });
    await disabilityDetailsPage.fillDiagnosis('Formally diagnosed disability details for automated test.');
    await disabilityDetailsPage.fillEstimatedDateOfDiagnosis('11', '1', '2000');
    await disabilityDetailsPage.answerSupportNeedsYes();
    await disabilityDetailsPage.clickSaveAndContinue();

    await assessmentPage.waitForAssessmentPage();
    await assessmentPage.uploadAssessmentDocument(assessmentDocumentFile);
    await assessmentPage.clickSaveAndContinue();

    await reviewPage.waitForReviewPage();
    await reviewPage.continueToDeclaration();

    await declarationPage.waitForDeclarationPage();
    await declarationPage.confirmDeclarations();
    await declarationPage.submitApplication();
  };

  // Retry up to 2 times if the "Can't find draft" modal triggers a restart
  let attempts = 0;
  while (true) {
    try {
      await runFormSteps();
      break;
    } catch (e: any) {
      if (e.message === 'DraftDeleted' && attempts < 2) {
        attempts++;
        console.log(`Draft deleted, restarting form (attempt ${attempts})...`);
        // Page is already reset to Before You Start by the locator handler
        continue;
      }
      throw e;
    }
  }

  await submissionPage.ensureNoLoadingError();
  await submissionPage.waitForSubmissionPage();
  const generatedId = await submissionPage.getGeneratedId();

  if (generatedId) {
    console.log('Generated ID: ' + generatedId);
  } else {
    console.log('Submission completed, but no generated ID was detected in the final page text.');
  }
});

