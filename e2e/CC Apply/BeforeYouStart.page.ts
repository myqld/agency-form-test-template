import { Locator, Page } from "@playwright/test";
import { AgencyFormPage } from "./AgencyForm.page";

export class BeforeYouStartPage extends AgencyFormPage {
    readonly beforeYouStartHeading: Locator;
    readonly draftDialog: Locator;
    readonly startNewButton: Locator;
    readonly applyForNewCardRadio: Locator;

    constructor(page: Page) {
        super(page);
        this.beforeYouStartHeading = page.getByRole("heading", { name: /before you start/i });
        this.draftDialog = page.getByRole("alertdialog", { name: /you have a draft form/i });
        this.startNewButton = page.getByRole("button", { name: "Start new" });
        this.applyForNewCardRadio = page.getByRole("radio", { name: /apply for a new card/i });
    }

    async startNewIfDraftExists() {
        const hasDraft = await this.draftDialog.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);

        if (hasDraft) {
            const startNewVisible = await this.startNewButton.isVisible({ timeout: 2000 }).catch(() => false);
            if (startNewVisible) {
                await this.startNewButton.click({ force: true });
            }

            await Promise.race([
                this.draftDialog.waitFor({ state: "hidden", timeout: 15000 }),
                this.page.getByRole("heading", { name: /before you start|what are you trying to do\?/i }).first()
                    .waitFor({ state: "visible", timeout: 15000 }),
            ]).catch(() => {});

            const dialogStillVisible = await this.draftDialog.isVisible().catch(() => false);
            if (dialogStillVisible) {
                await this.startNewButton.click({ force: true }).catch(() => {});
                await this.draftDialog.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
            }
        }
    }

    async selectApplyForNewCard() {
        await this.beforeYouStartHeading.waitFor({ state: "visible", timeout: 60000 });
        await this.page.waitForTimeout(1000);

        const radioVisible = await this.applyForNewCardRadio.isVisible().catch(() => false);
        if (radioVisible) {
            await this.applyForNewCardRadio.check({ force: true }).catch(async () => {
                await this.applyForNewCardRadio.click({ force: true });
            });
            await this.page.waitForTimeout(500);
            return;
        }

        const applyText = this.page.getByText("Apply for a new card").first();
        await applyText.waitFor({ state: "visible", timeout: 30000 });
        await applyText.click({ force: true });
        await this.page.waitForTimeout(500);
    }

    async completeBeforeYouStart() {
        await this.startNewIfDraftExists();
        await this.selectApplyForNewCard();
        await this.clickSaveAndContinue();
    }
}
