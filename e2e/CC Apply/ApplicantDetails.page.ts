import { Locator, Page } from "@playwright/test";
import { AgencyFormPage } from "./AgencyForm.page";

export class ApplicantDetailsPage extends AgencyFormPage {
    readonly applicantDetailsHeading: Locator;
    readonly permanentResidentRadioGroup: Locator;
    readonly dobGroup: Locator;
    readonly applicantPhotoVerificationCheckBox: Locator;

    constructor(page: Page) {
        super(page);
        this.applicantDetailsHeading = page.getByRole("heading", { name: /applicant details/i }).first();
        this.permanentResidentRadioGroup = page.getByRole("radiogroup", {
            name: /is the person with a disability a permanent resident of queensland\?/i,
        });
        this.dobGroup = page.getByRole("group", { name: "Date of birth" });
        this.applicantPhotoVerificationCheckBox = page.getByRole("checkbox", {
            name: /uploaded photo has been sighted and verified by my health professional/i,
        });
    }

    async waitForApplicantDetailsPage() {
        await this.applicantDetailsHeading.waitFor({ state: "visible", timeout: 60_000 });
    }

    async selectPermanentResident(isPermanentResident: boolean) {
        const label = isPermanentResident ? "Yes" : "No";
        const radioInGroup = this.permanentResidentRadioGroup.getByRole("radio", { name: label });

        if (await radioInGroup.count()) {
            await this.withModalWatch(() => radioInGroup.check());
            return;
        }

        await this.withModalWatch(() => this.page.getByRole("radio", { name: label }).first().check());
    }

    async fillDateOfBirth(day: string, month: string, year: string) {
        await this.dobGroup.getByRole("spinbutton").nth(0).fill(day);
        await this.dobGroup.getByRole("spinbutton").nth(1).fill(month);
        await this.dobGroup.getByRole("spinbutton").nth(2).fill(year);
    }

    async uploadApplicantPhoto(file: { name: string; mimeType: string; buffer: Buffer }) {
        await this.uploadFile({ file });
    }

    async verifyApplicantPhoto() {
        await this.withModalWatch(() => this.applicantPhotoVerificationCheckBox.check({ force: true }));
    }
}
