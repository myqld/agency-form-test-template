import { expect, Locator, Page } from "@playwright/test";
import { AgencyFormPage } from "./AgencyForm.page";

export class ContactDetailsPage extends AgencyFormPage {
    readonly homeAddress = "360 EDWARD ST BRISBANE CITY QLD 4000";

    readonly applicantTypeMyselfOption: Locator;
    readonly preferredContactEmailOption: Locator;
    readonly findEmailField: Locator;
    readonly findMobilePhoneNumberField: Locator;
    readonly checkOtherNumbersRadio: Locator;
    readonly findHomeAddressField: Locator;
    readonly findResetHomeAddressButton: Locator;
    readonly checkSameAsResidential: Locator;
    readonly checkOtherAddressesRadio: Locator;
    readonly homeAddressSelectOption: Locator;
    readonly howToContactEmailOption: Locator;
    readonly howToContactEmailField: Locator;
    readonly addAddressButton: Locator;
    readonly addressHistoryAutocomplete: Locator;
    readonly enterAddressManuallyButton: Locator;
    readonly startDateGroup: Locator;
    readonly endDateGroup: Locator;
    readonly saveDetailsButton: Locator;

    constructor(page: Page) {
        super(page);
        this.applicantTypeMyselfOption = page.getByRole("radio", { name: /myself, the person with a/i }).first();
        this.preferredContactEmailOption = page.getByRole("radio", { name: /^email$/i }).first();
        this.findEmailField = page.getByRole("textbox", { name: "Email" });
        this.findMobilePhoneNumberField = page.getByLabel("Mobile phone number");
        this.checkOtherNumbersRadio = page.getByRole("radiogroup", { name: "Do you have any other phone numbers?" });
        this.findHomeAddressField = page.getByLabel("Home address", { exact: true });
        this.findResetHomeAddressButton = page.getByLabel("Reset Home address");
        this.checkSameAsResidential = page.getByRole("checkbox", { name: "Same as home address" });
        this.checkOtherAddressesRadio = page.getByRole("radiogroup", {
            name: "Have you lived at any other address in the last 15 years?",
        });
        this.homeAddressSelectOption = page.getByText(this.homeAddress);
        this.howToContactEmailOption = page.getByLabel("Which method would you like").getByText("Email");
        this.howToContactEmailField = page.locator('input[name*="email" i]').first();
        this.addAddressButton = page.getByRole("button", { name: "Add an address" });
        this.addressHistoryAutocomplete = page.getByRole("combobox", { name: /address/i });
        this.enterAddressManuallyButton = page.getByRole("button", { name: "Enter my address manually" });
        this.startDateGroup = page.getByRole("group", { name: "Start date at this address" });
        this.endDateGroup = page.getByRole("group", { name: /End date at this address/ });
        this.saveDetailsButton = page.getByRole("button", { name: "Save details" });
    }

    async fillEmailAddress(emailAddress: string) {
        await this.findEmailField.fill(emailAddress);
    }

    async fillMobilePhoneNumber(mobileNumber: string) {
        await this.findMobilePhoneNumberField.click();
        await this.findMobilePhoneNumberField.fill(mobileNumber);
    }

    async fillHomeAddress(searchText: string) {
        await this.checkSameAsResidential.scrollIntoViewIfNeeded();
        await this.findHomeAddressField.pressSequentially(searchText, { delay: 400 });
        await expect(this.homeAddressSelectOption).toBeVisible();
        await this.homeAddressSelectOption.click();
    }

    async selectAndFillEmailHowToContact(emailAddress: string) {
        await this.howToContactEmailOption.click();
        await this.howToContactEmailField.fill(emailAddress);
    }

    async checkPostAddress(sameAsResidential: boolean) {
        if (sameAsResidential) {
            const isChecked = await this.checkSameAsResidential.isChecked();
            if (!isChecked) {
                await this.checkSameAsResidential.click();
            }
        }
    }

    async checkOtherAddress(hasOtherAddress: boolean) {
        const selectedRadioText = hasOtherAddress ? "Yes" : "No";
        await this.checkOtherAddressesRadio.getByText(selectedRadioText).check();
    }

    async chooseMyselfAsApplicant() {
        if (await this.applicantTypeMyselfOption.count()) {
            await this.withModalWatch(() =>
                this.applicantTypeMyselfOption.check({ force: true }).catch(() =>
                    this.applicantTypeMyselfOption.click({ force: true })
                )
            );
        }
    }

    async chooseEmailContactPreference() {
        // Wait for the page to settle after applicant type selection (fields load dynamically)
        await this.page.waitForLoadState("networkidle").catch(() => {});

        // Wait up to 10s for the "Which method would you like → Email" option to appear
        await this.howToContactEmailOption.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});

        if (await this.howToContactEmailOption.isVisible().catch(() => false)) {
            await this.withModalWatch(() => this.howToContactEmailOption.click({ force: true }));
            return;
        }

        // Try email radio buttons by role (first or last)
        for (const radio of [
            this.page.getByRole("radio", { name: /^email$/i }).first(),
            this.page.getByRole("radio", { name: /^email$/i }).last(),
        ]) {
            if (await radio.count()) {
                await radio.scrollIntoViewIfNeeded().catch(() => {});
                const checked = await this.withModalWatch(() =>
                    radio.check({ force: true })
                        .then(() => radio.isChecked())
                        .catch(() => false)
                );
                if (checked) return;
            }
        }

        // Last resort — click the last visible "Email" text on the page
        await this.withModalWatch(() =>
            this.page.getByText("Email", { exact: true }).last().click({ force: true })
        );
    }

    async completeMyIdContactDetails() {
        await this.chooseMyselfAsApplicant();
        await this.chooseEmailContactPreference();
    }
}
