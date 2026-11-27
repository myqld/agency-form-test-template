import { expect, Locator, Page } from "@playwright/test";
import { AgencyFormPage } from "../AgencyForm.page";

export class DeclarationPage extends AgencyFormPage {
    readonly findAgreeCheckbox: Locator;
    readonly consentToServiceCheckbox: Locator;
    readonly consentToShareCheckbox: Locator;

    constructor(page: Page) {
        super(page);
        this.findAgreeCheckbox = page.getByText(/I agree that I have read and understood all the information above/i);
        this.consentToServiceCheckbox = page.getByText(/I consent to share my digital identity details with the/i);
        this.consentToShareCheckbox = page.getByText(
            /I consent to the collection, use and sharing of my personal information to the/i
        );
    }

    async fillInDeclarationForm(isAssistedForms = false) {
        await expect(this.findAgreeCheckbox).not.toBeChecked();
        await this.findAgreeCheckbox.click();
        await expect(this.findAgreeCheckbox).toBeChecked();
        if (!isAssistedForms) {
            await expect(this.consentToServiceCheckbox).not.toBeChecked();
            await this.consentToServiceCheckbox.click();
            await expect(this.consentToServiceCheckbox).toBeChecked();
        }
        await expect(this.consentToShareCheckbox).not.toBeChecked();
        await this.consentToShareCheckbox.click();
        await expect(this.consentToShareCheckbox).toBeChecked();
    }
}
