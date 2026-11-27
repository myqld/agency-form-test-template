import { Locator, Page } from "@playwright/test";
import { AgencyFormPage } from "../AgencyForm.page";

export class NewComponentTestingPage extends AgencyFormPage {
    readonly favouriteBeanSelectInput: Locator;
    readonly favouriteFruitSelectInput: Locator;
    readonly countryOfBirthTextComboBoxTextField: Locator;
    readonly countriesVistedComboxTextField: Locator;
    readonly favouriteFruitComboboxTextField: Locator;

    constructor(page: Page) {
        super(page);
        this.favouriteBeanSelectInput = page.locator('select[name="data[whatIsYourFavouriteBean]"]');
        this.favouriteFruitSelectInput = page.locator('select[name="data[favourit]"]');
        this.countryOfBirthTextComboBoxTextField = page.getByRole("combobox", { name: /Country of birth/i });
        this.countriesVistedComboxTextField = page.getByRole("combobox", {
            name: "Countries you have visited. This component uses the new combo box widget configured as multi-select. ",
        });
        this.favouriteFruitComboboxTextField = page.getByRole("combobox", { name: /Select your favourite fruits/i });
    }

    async fillInNewComponentTestingPage() {
        await this.favouriteBeanSelectInput.selectOption({ index: 2 });

        // Favourite type of fruit (select)
        await this.favouriteFruitSelectInput.selectOption({ index: 2 });

        // Country of birth
        await this.countryOfBirthTextComboBoxTextField.click();
        await this.countryOfBirthTextComboBoxTextField.fill("Australia");
        await this.page.getByText("Australia").click();

        // Countries visited
        await this.countriesVistedComboxTextField.click();
        await this.countriesVistedComboxTextField.fill("New");
        await this.page.getByText("New Zealand").click();
        await this.page.getByText("Papua New Guinea").click();

        // Favourite type of fruit (combobox)
        await this.favouriteFruitComboboxTextField.click();
        await this.favouriteFruitComboboxTextField.selectOption({ index: 2 });
    }
}
