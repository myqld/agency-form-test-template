import { Locator, Page } from "@playwright/test";
import { AgencyFormPage } from "./AgencyForm.page";

export class DisabilityDetailsPage extends AgencyFormPage {
    readonly diagnosisTextArea: Locator;
    readonly diagnosisDateGroup: Locator;
    readonly helpGettingAroundGroup: Locator;
    readonly helpWithCommunicationGroup: Locator;
    readonly helpWithSelfCareGroup: Locator;
    readonly helpWithPlanningGroup: Locator;

    constructor(page: Page) {
        super(page);
        this.diagnosisTextArea = page.locator("textarea").first();
        this.diagnosisDateGroup = page.getByRole("group", { name: /estimated date of diagnosis|date of diagnosis/i });
        this.helpGettingAroundGroup = page.getByLabel("Do you need help getting");
        this.helpWithCommunicationGroup = page.getByRole("radiogroup", { name: "Do you need help with communication?" });
        this.helpWithSelfCareGroup = page.getByRole("radiogroup", { name: "Do you need help with self-" });
        this.helpWithPlanningGroup = page.getByLabel("Do you need help with planning and managing decisions?");
    }

    async fillDiagnosis(description: string) {
        await this.diagnosisTextArea.fill(description);
    }

    async fillEstimatedDateOfDiagnosis(day: string, month: string, year: string) {
        if (await this.diagnosisDateGroup.count()) {
            await this.diagnosisDateGroup.getByPlaceholder("dd").fill(day);
            await this.diagnosisDateGroup.getByPlaceholder("mm").fill(month);
            await this.diagnosisDateGroup.getByPlaceholder("yyyy").fill(year);
            return;
        }

        await this.page.getByPlaceholder("dd").nth(1).fill(day);
        await this.page.getByPlaceholder("mm").nth(1).fill(month);
        await this.page.getByPlaceholder("yyyy").nth(1).fill(year);
    }

    async answerSupportNeedsYes() {
        await this.helpGettingAroundGroup.getByText("Yes").click();
        await this.helpWithCommunicationGroup.getByLabel("Yes").check();
        await this.helpWithSelfCareGroup.getByLabel("Yes").check();
        await this.helpWithPlanningGroup.getByText("Yes").click();
    }
}
