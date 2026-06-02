import { expect, Locator, Page } from "@playwright/test";
import { AgencyFormPage } from "./AgencyForm.page";

export class ReviewPage extends AgencyFormPage {
    readonly reviewHeading: Locator;
    readonly beforeYouStartSectionHeading: Locator;
    readonly contactDetailsSectionHeading: Locator;
    readonly applicantDetailsSectionHeading: Locator;
    readonly disabilityDetailsSectionHeading: Locator;
    readonly hpAssessmentSectionHeading: Locator;

    constructor(page: Page) {
        super(page);
        this.reviewHeading = page.getByRole("heading", { name: /review/i }).first();
        this.beforeYouStartSectionHeading = page.getByRole("heading", { name: /before you start|what are you trying to do\?/i }).first();
        this.contactDetailsSectionHeading = page.getByRole("heading", { name: /contact details/i }).first();
        this.applicantDetailsSectionHeading = page.getByRole("heading", { name: /applicant details/i }).first();
        this.disabilityDetailsSectionHeading = page.getByRole("heading", { name: /disability details/i }).first();
        this.hpAssessmentSectionHeading = page.getByRole("heading", { name: /health professional assessment/i }).first();
    }

    async waitForReviewPage() {
        const reviewVisible = await this.reviewHeading.isVisible({ timeout: 60000 }).catch(() => false);
        if (reviewVisible) return;

        await expect(this.beforeYouStartSectionHeading).toBeVisible({ timeout: 60000 });
        await expect(this.contactDetailsSectionHeading).toBeVisible({ timeout: 60000 });
        await expect(this.applicantDetailsSectionHeading).toBeVisible({ timeout: 60000 });
        await expect(this.disabilityDetailsSectionHeading).toBeVisible({ timeout: 60000 });
        await expect(this.hpAssessmentSectionHeading).toBeVisible({ timeout: 60000 });
    }

    async continueToDeclaration() {
        await this.clickSaveAndContinue();
    }
}
