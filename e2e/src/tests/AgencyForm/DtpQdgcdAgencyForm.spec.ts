import { expect, Page } from "@playwright/test";
import { test } from "../../fixtures/UserAuthenticated";
import { QGCDGFormPage } from "../../pages/QgcdgPages/AgencyForm.page";
import { checkDraftExists } from "../../api/utils";
import { Client } from "@urql/core";
import { getPageClient, getSubscriberClient } from "../../api/client/client";
import { getSubmissionFromQueue } from "../../api/subscriber/getSubmissionFromQueue";
import { getPresignedUrls } from "../../api/subscriber/getPresignedUrls";
import { AgencyFormPageHeadings } from "../../pages/AgencyForm.page";

test.describe.serial("Complete full QGCDG form using Assisted Forms", () => {
    let form: QGCDGFormPage;
    let page: Page;
    let client: Client;
    let e2eSubscriberClient: Client;
    let referenceNumber: string;
    let submissionDetails: any;

    test.beforeAll(async ({ userAuthenticatedContext }) => {
        page = await userAuthenticatedContext.newPage();
        form = new QGCDGFormPage(page);
        client = await getPageClient(form.page);
        const hasDraft = await checkDraftExists(form.TRANSACTION_NAME, client);
        await form.goToQgcdgForm();
        if (hasDraft) {
            await form.draftModal.startNewIfDraft();
        }
        e2eSubscriberClient = await getSubscriberClient();

        await page.route("https://www.*.graph.qld.gov.au/graphql", async (route) => {
            if (route.request().postDataJSON().operationName === "GetReferenceNumber") {
                const response = await route.fetch();
                referenceNumber = (await response.json()).data.transactionServiceRequest.referenceNum;
                await route.fulfill({ response });
            } else {
                await route.continue();
            }
        });
    });

    test.afterAll(async () => {
        await page.close();
    });

    test("Start and complete the form", async () => {
        await test.step("Complete type of Eligibility page, go to next page", async () => {
            await form.eligibilityPage.fillInEligibilityPage();
            await form.nextPage(AgencyFormPageHeadings.TYPE_OF_APPLICATION);
        });

        await test.step("Complete type of application page, go to next page", async () => {
            await form.typeOfApplicationPage.fillInApplicationTypePage();
            await form.nextPage(AgencyFormPageHeadings.PERSONAL_DETAILS);
        });

        await test.step("Complete personal details page", async () => {
            await form.personalDetailsPage.fillInPersonalDetailsForm();
            await form.nextPage(AgencyFormPageHeadings.CONTACT_DETAILS);
        });

        await test.step("Complete contact details page", async () => {
            await form.contactDetailsPage.fillInContactDetailsForm();
            await form.nextPage(AgencyFormPageHeadings.NEW_COMPONENT_TESTING);
        });

        await test.step("Complete new component page", async () => {
            await form.newComponentTestingPage.fillInNewComponentTestingPage();
            await form.nextPage(AgencyFormPageHeadings.REVIEW);
        });

        await test.step("Complete review page", async () => {
            await form.nextPage(AgencyFormPageHeadings.CONSENT_AND_DECLARATION);
        });

        await test.step("Complete declaration page", async () => {
            await form.declarationPage.fillInDeclarationForm();
            await form.submitForm();
        });

        await test.step("Verify download pdf on confirmation page", async () => {
            await expect(form.confirmationPage.pageTitle).toBeVisible();
            await expect(form.confirmationPage.referenceNumber).toBeVisible();
            await expect(form.downloadPdfButton).toContainText(/(PDF, ~\d{2}\.\dKB)/);
            await form.confirmationPage.downloadAndVerifyPdf("QGCDG Test Form", "QGCDG");
        });

        await test.step("Check queued message", async () => {
            expect(referenceNumber).toBeDefined();
            const { submission } = await getSubmissionFromQueue(e2eSubscriberClient, referenceNumber ?? "");
            submissionDetails = submission;
            expect(submission).toBeDefined();
        });

        await test.step("Will get presigned urls", async () => {
            const attachments = await getPresignedUrls({
                client: e2eSubscriberClient,
                subjectId: submissionDetails.customerID,
                transactionId: submissionDetails.transactionID,
                requestId: submissionDetails.requestID,
            });

            expect(attachments.length).toEqual(2);
        });
    });
});
