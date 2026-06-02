import { expect, Page } from "@playwright/test";
import { AgencyFormPage } from "./AgencyForm.page";

export class SubmissionPage extends AgencyFormPage {
    constructor(page: Page) {
        super(page);
    }

    async waitForSubmissionPage() {
        await this.page.waitForLoadState("domcontentloaded").catch(() => {});
        await this.page.waitForLoadState("networkidle").catch(() => {});
        await expect(this.page.getByText(/submitted|application received|reference|thank you/i).first()).toBeVisible({ timeout: 30_000 });
    }

    async getGeneratedId(): Promise<string | undefined> {
        await this.page.waitForLoadState("domcontentloaded").catch(() => {});
        await this.page.waitForLoadState("networkidle").catch(() => {});

        const pageText = (await this.page.locator("main, body").first().innerText().catch(() => "")) ?? "";
        const labelledMatch = pageText.match(/(?:generated id|reference number|reference no\.?|application number)\s*[:#-]?\s*([A-Z0-9-]{6,})/i);
        const genericMatch = pageText.match(/\b[A-Z]{2,}-[A-Z0-9-]{4,}\b|\b[A-Z0-9]{8,}\b/);

        return labelledMatch?.[1] ?? genericMatch?.[0];
    }
}
