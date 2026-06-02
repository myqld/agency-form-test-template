import { Locator, Page } from "@playwright/test";
import { AgencyFormPage } from "./AgencyForm.page";

export class DeclarationPage extends AgencyFormPage {
    readonly confirmFollowingHeading: Locator;
    readonly agreeInformationCheckBox: Locator;
    readonly consentShareIdentityCheckBox: Locator;
    readonly consentCollectionCheckBox: Locator;
    readonly submitButton: Locator;

    constructor(page: Page) {
        super(page);
        this.confirmFollowingHeading = page.getByRole("heading", { name: /confirm the following/i }).first();
        this.agreeInformationCheckBox = page.getByRole("checkbox", {
            name: /i agree that i have read and understood all the information above/i,
        });
        this.consentShareIdentityCheckBox = page.getByRole("checkbox", {
            name: /i consent to share my digital identity details with the apply for a companion card service/i,
        });
        this.consentCollectionCheckBox = page.getByRole("checkbox", {
            name: /i consent to the collection, use and sharing of my personal information to the apply for a companion card service/i,
        });
        this.submitButton = page.getByRole("button", { name: "Submit" });
    }

    async waitForDeclarationPage() {
        await this.confirmFollowingHeading.waitFor({ state: "visible", timeout: 60_000 });
    }

    async confirmDeclarations() {
        await this.agreeInformationCheckBox.check();
        await this.consentShareIdentityCheckBox.check();
        await this.consentCollectionCheckBox.check();
    }

    async submitApplication() {
        await this.submitButton.click();
    }
}
