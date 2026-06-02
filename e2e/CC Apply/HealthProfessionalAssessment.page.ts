import { expect, Locator, Page } from "@playwright/test";
import { AgencyFormPage } from "./AgencyForm.page";

export class HealthProfessionalAssessmentPage extends AgencyFormPage {
    readonly uploadAssessmentHeading: Locator;

    constructor(page: Page) {
        super(page);
        this.uploadAssessmentHeading = page.getByText(/upload all pages of the health professional assessment/i);
    }

    async waitForAssessmentPage() {
        await expect(this.uploadAssessmentHeading).toBeVisible({ timeout: 60_000 });
    }

    async uploadAssessmentDocument(file: { name: string; mimeType: string; buffer: Buffer }) {
        await this.uploadFile({ file });
    }
}
