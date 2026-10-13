/* SPDX-License-Identifier: AGPL-3.0-only */

export class AutomodSlurConfiguration {
    enabled: boolean = true;
    includeSoftA: boolean = false;
    suspendDays: number = 7;
    deleteAllMessages: boolean = true;
    violationDays: number = 90;
    actOnVerifiedReports: boolean = true;
}

export type AutomodWordListAction = "delete" | "suspend" | "name";

export interface AutomodWordList {
    id: string;
    name: string;
    terms: string[];
    action: AutomodWordListAction;
    suspendDays: number;
}

export class AutomodRegistrationConfiguration {
    maxAccountsPerIpPerDay: number = 0;
}

export class AutomodLoginConfiguration {
    maxFailedAttemptsPerAccount: number = 10;
    lockoutMinutes: number = 15;
}

export type AutomodSpamAction = "log" | "delete" | "timeout" | "suspend" | "disable";

export class AutomodSpamEveryoneConfiguration {
    enabled: boolean = true;
    action: AutomodSpamAction = "timeout";
    windowSeconds: number = 600;
    unpermittedLimit: number = 2;
    permittedLimit: number = 4;
    exemptAccountAgeDays: number = 0;
}

export class AutomodSpamMentionConfiguration {
    enabled: boolean = true;
    action: AutomodSpamAction = "timeout";
    messageLimit: number = 10;
    windowLimit: number = 20;
    windowSeconds: number = 60;
    exemptAccountAgeDays: number = 0;
}

export class AutomodSpamFloodConfiguration {
    enabled: boolean = true;
    action: AutomodSpamAction = "timeout";
    messageLimit: number = 15;
    windowSeconds: number = 10;
    channelLimit: number = 5;
    channelWindowSeconds: number = 30;
    exemptAccountAgeDays: number = 0;
}

export class AutomodSpamDuplicateConfiguration {
    enabled: boolean = true;
    action: AutomodSpamAction = "delete";
    minLength: number = 30;
    windowSeconds: number = 120;
    channelLimit: number = 3;
    accountLimit: number = 5;
    exemptAccountAgeDays: number = 0;
}

export class AutomodSpamLinkConfiguration {
    enabled: boolean = true;
    action: AutomodSpamAction = "delete";
    inviteLimit: number = 2;
    linkLimit: number = 4;
    windowSeconds: number = 300;
    exemptAccountAgeDays: number = 7;
}

export class AutomodSpamBurstConfiguration {
    enabled: boolean = true;
    action: AutomodSpamAction = "suspend";
    accountLimit: number = 4;
    minLength: number = 10;
    windowSeconds: number = 300;
    exemptAccountAgeDays: number = 1;
}

export class AutomodSpamConfiguration {
    everyone: AutomodSpamEveryoneConfiguration = new AutomodSpamEveryoneConfiguration();
    mentions: AutomodSpamMentionConfiguration = new AutomodSpamMentionConfiguration();
    flood: AutomodSpamFloodConfiguration = new AutomodSpamFloodConfiguration();
    duplicates: AutomodSpamDuplicateConfiguration = new AutomodSpamDuplicateConfiguration();
    links: AutomodSpamLinkConfiguration = new AutomodSpamLinkConfiguration();
    burst: AutomodSpamBurstConfiguration = new AutomodSpamBurstConfiguration();
    timeoutMinutes: number = 60;
    suspendHours: number = 24;
    escalateAfterStrikes: number = 3;
    strikeWindowHours: number = 24;
}

export class AutomodConfiguration {
    slurs: AutomodSlurConfiguration = new AutomodSlurConfiguration();
    wordLists: AutomodWordList[] = [];
    allowList: string[] = [];
    registration: AutomodRegistrationConfiguration = new AutomodRegistrationConfiguration();
    login: AutomodLoginConfiguration = new AutomodLoginConfiguration();
    spam: AutomodSpamConfiguration = new AutomodSpamConfiguration();
}
