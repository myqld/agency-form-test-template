import { expect, Page } from "@playwright/test";
import { testAssistedForms as test } from "../../fixtures/UserAuthenticated";
import { QGCDGFormPage } from "../../pages/QgcdgPages/AgencyForm.page";
import { getSubmissionFromQueue } from "../../api/subscriber/getSubmissionFromQueue";
import { getPresignedUrls } from "../../api/subscriber/getPresignedUrls";
import { Client } from "@urql/core";
import { getSubscriberClient } from "../../api/client/client";
import { AgencyFormPageHeadings } from "../../pages/AgencyForm.page";

test.describe.serial("Complete full QGCDG form using Assisted Forms", () => {
    let form: QGCDGFormPage;
    let page: Page;
    let referenceNumber: string;
    let submissionDetails: any;
    let e2eSubscriberClient: Client;

    test.beforeAll(async ({ userAuthenticatedContext }) => {
        page = await userAuthenticatedContext.newPage();
        await page.context().addInitScript(() => {
            sessionStorage.setItem("isAssistedForms", "true");
        });

        form = new QGCDGFormPage(page);
        await form.goToQgcdgForm(true);

        await page.route("https://www.*.graph.qld.gov.au/graphql", async (route) => {
            if (route.request().postDataJSON().operationName === "MyQLDAgentUpdateServiceRequest") {
                const response = await route.fetch();
                const responseBody = (await response.json()) as {
                    data?: {
                        myQLDAgentUpdateServiceRequest?: {
                            referenceNum?: string;
                        };
                    } | null;
                };
                const fetchedReferenceNumber = responseBody.data?.myQLDAgentUpdateServiceRequest?.referenceNum;
                if (fetchedReferenceNumber) {
                    referenceNumber = fetchedReferenceNumber;
                }
                await route.fulfill({ response });
            } else {
                await route.continue();
            }
        });
        e2eSubscriberClient = await getSubscriberClient();
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
            await form.typeOfApplicationPage.fillInApplicationTypePage(true);
            await form.nextPage(AgencyFormPageHeadings.PERSONAL_DETAILS);
        });

        await test.step("Complete personal details page", async () => {
            await form.personalDetailsPage.fillInPersonalDetailsForm(true);
            await form.nextPage(AgencyFormPageHeadings.CONTACT_DETAILS);
        });

        await test.step("Complete contact details page", async () => {
            await form.contactDetailsPage.fillInContactDetailsForm(true);
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
            await form.declarationPage.fillInDeclarationForm(true);
            await form.submitForm();
        });

        await test.step("Verify download pdf on confirmation page", async () => {
            await expect(form.confirmationPage.inPageAlertHeader).toBeVisible();
            await expect(form.confirmationPage.referenceNumber).toBeVisible();
            await expect(form.downloadPdfButton).toContainText("PDF");
            await form.confirmationPage.downloadAndVerifyPdf(form.AF_TRANSACTION_NAME, "MQAF", true);
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
