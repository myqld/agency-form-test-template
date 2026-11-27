import { expect, Locator, Page } from "@playwright/test";
import { config } from "../../../config";
import { AgencyFormPage } from "../AgencyForm.page";

export class ContactDetailsPage extends AgencyFormPage {
    readonly homeAddress = "360 EDWARD ST BRISBANE CITY QLD 4000";

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

    // Other address (EditGrid row)
    readonly addAddressButton: Locator;
    readonly addressHistoryAutocomplete: Locator;
    readonly enterAddressManuallyButton: Locator;
    readonly startDateGroup: Locator;
    readonly endDateGroup: Locator;
    readonly saveDetailsButton: Locator;

    constructor(page: Page) {
        super(page);
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
        this.howToContactEmailField = page.locator(
            'input[name="data[whichMethodWouldYouLikeUsToContactYouBy][emailAloe2]"]'
        );

        // Other Address (EditGrid row)
        this.addAddressButton = page.getByRole("button", { name: "Add an address" });
        this.addressHistoryAutocomplete = page.getByRole("combobox", {
            name: /Qld address autocomplete|Enter an address/,
        });
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
        // Scroll down to ensure address search results are visible and clickable in Webkit.
        await this.checkSameAsResidential.scrollIntoViewIfNeeded();

        const existingAddress = (await this.findHomeAddressField.inputValue().catch(() => "")).trim();
        if (existingAddress.length > 0) {
            return;
        }

        await this.findHomeAddressField.pressSequentially(searchText, { delay: 400 });

        await expect(this.homeAddressSelectOption).toBeVisible();
        await this.homeAddressSelectOption.click();
    }

    async selectAndFillEmailHowToContact(emailAddress: string) {
        await this.howToContactEmailOption.click();
        await this.howToContactEmailField.fill(emailAddress);
    }

    async checkPostAddress(checkPostAddress: boolean) {
        if (checkPostAddress) {
            const isChecked = await this.checkSameAsResidential.isChecked();
            if (!isChecked) {
                await this.checkSameAsResidential.click();
            }
        }
    }

    async checkOtherAddress(checkOtherAddress: boolean) {
        const selectedRadioText = checkOtherAddress ? "Yes" : "No";
        await expect(this.checkOtherAddressesRadio.getByText(selectedRadioText)).not.toBeChecked();
        await this.checkOtherAddressesRadio.getByText(selectedRadioText).check();
    }

    async fillOtherAddress(isAssistedForms?: boolean) {
        await this.addAddressButton.click();
        await expect(this.startDateGroup).toBeVisible({ timeout: 30_000 });

        // Fill address via autocomplete if available, otherwise skip (CI may not have it)
        if (await this.addressHistoryAutocomplete.isVisible().catch(() => false)) {
            await this.saveDetailsButton.scrollIntoViewIfNeeded();
            await this.addressHistoryAutocomplete.pressSequentially(this.homeAddress, { delay: 400 });
            await expect(this.page.getByText(this.homeAddress).first()).toBeVisible();
            await this.page.getByText(this.homeAddress).first().click();
        }

        // Fill start date (Day, Month, Year spinbuttons within the group)
        const startDay = this.startDateGroup.getByRole("spinbutton").nth(0);
        const startMonth = this.startDateGroup.getByRole("spinbutton").nth(1);
        const startYear = this.startDateGroup.getByRole("spinbutton").nth(2);
        await startDay.click();
        await startDay.fill("01");
        await startMonth.click();
        await startMonth.fill("01");
        await startYear.click();
        await startYear.fill("2020");

        // Fill end date (Day, Month, Year spinbuttons within the group)
        const endDay = this.endDateGroup.getByRole("spinbutton").nth(0);
        const endMonth = this.endDateGroup.getByRole("spinbutton").nth(1);
        const endYear = this.endDateGroup.getByRole("spinbutton").nth(2);
        await endDay.click();
        await endDay.fill("01");
        await endMonth.click();
        await endMonth.fill("01");
        await endYear.click();
        await endYear.fill("2021");

        await this.uploadFile({
            fileComponentLabel: "Upload evidence",
            file: {
                name: "conditional-address-test-file.pdf",
                mimeType: "application/pdf",
                buffer: Buffer.from("E2E test content"),
            },
            isNewFileComponent: true,
            isAssistedForms: isAssistedForms,
        });

        await this.saveDetailsButton.click();
        await expect(this.page.getByText("Remove")).toBeVisible();
    }

    async fillInContactDetailsForm(isAssistedForms?: boolean) {
        await this.fillEmailAddress(config.E2E_TEST_USER_EMAIL);
        await this.fillMobilePhoneNumber("0123456789");
        await this.fillHomeAddress(this.homeAddress);
        await this.checkPostAddress(true);
        await this.checkOtherAddress(true);
        await this.fillOtherAddress(isAssistedForms);
        await this.selectAndFillEmailHowToContact(config.E2E_TEST_USER_EMAIL);
    }
}
