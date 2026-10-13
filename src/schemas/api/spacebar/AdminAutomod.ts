/* SPDX-License-Identifier: AGPL-3.0-only */

export interface AdminAutomodWordListSchema {
    /**
     * @maxLength 64
     */
    id?: string;
    /**
     * @minLength 1
     * @maxLength 64
     */
    name: string;
    /**
     * @maxItems 500
     */
    terms: string[];
    action: "delete" | "suspend" | "name";
    /**
     * @minimum 1
     * @maximum 365
     */
    suspendDays?: number;
}

export type AdminAutomodSpamAction = "log" | "delete" | "timeout" | "suspend" | "disable";

export interface AdminAutomodSpamRuleSchema {
    enabled?: boolean;
    action?: AdminAutomodSpamAction;
    /**
     * @minimum 0
     * @maximum 3650
     */
    exemptAccountAgeDays?: number;
    /**
     * @minimum 1
     * @maximum 86400
     */
    windowSeconds?: number;
}

export interface AdminAutomodSpamSchema {
    everyone?: AdminAutomodSpamRuleSchema & {
        /**
         * @minimum 1
         * @maximum 1000
         */
        unpermittedLimit?: number;
        /**
         * @minimum 1
         * @maximum 1000
         */
        permittedLimit?: number;
    };
    mentions?: AdminAutomodSpamRuleSchema & {
        /**
         * @minimum 1
         * @maximum 1000
         */
        messageLimit?: number;
        /**
         * @minimum 1
         * @maximum 10000
         */
        windowLimit?: number;
    };
    flood?: AdminAutomodSpamRuleSchema & {
        /**
         * @minimum 2
         * @maximum 1000
         */
        messageLimit?: number;
        /**
         * @minimum 2
         * @maximum 1000
         */
        channelLimit?: number;
        /**
         * @minimum 1
         * @maximum 86400
         */
        channelWindowSeconds?: number;
    };
    duplicates?: AdminAutomodSpamRuleSchema & {
        /**
         * @minimum 1
         * @maximum 2000
         */
        minLength?: number;
        /**
         * @minimum 2
         * @maximum 1000
         */
        channelLimit?: number;
        /**
         * @minimum 2
         * @maximum 1000
         */
        accountLimit?: number;
    };
    links?: AdminAutomodSpamRuleSchema & {
        /**
         * @minimum 1
         * @maximum 1000
         */
        inviteLimit?: number;
        /**
         * @minimum 1
         * @maximum 1000
         */
        linkLimit?: number;
    };
    burst?: AdminAutomodSpamRuleSchema & {
        /**
         * @minimum 2
         * @maximum 1000
         */
        accountLimit?: number;
        /**
         * @minimum 1
         * @maximum 2000
         */
        minLength?: number;
    };
    /**
     * @minimum 1
     * @maximum 40320
     */
    timeoutMinutes?: number;
    /**
     * @minimum 1
     * @maximum 8760
     */
    suspendHours?: number;
    /**
     * @minimum 0
     * @maximum 100
     */
    escalateAfterStrikes?: number;
    /**
     * @minimum 1
     * @maximum 720
     */
    strikeWindowHours?: number;
}

export interface AdminAutomodRaidSchema {
    /**
     * @minimum 0
     * @maximum 100000
     */
    raidJoinThreshold?: number;
    /**
     * @minimum 10
     * @maximum 86400
     */
    raidJoinWindowSeconds?: number;
    /**
     * @minimum 0
     * @maximum 100000
     */
    raidNewAccountJoinThreshold?: number;
    /**
     * @minimum 1
     * @maximum 8760
     */
    raidNewAccountHours?: number;
    /**
     * @minimum 0
     * @maximum 100000
     */
    raidInviteJoinThreshold?: number;
    /**
     * @minimum 0
     * @maximum 1440
     */
    raidPauseInvitesMinutes?: number;
    /**
     * @minimum 0
     * @maximum 100000
     */
    dmRaidThreshold?: number;
    /**
     * @minimum 10
     * @maximum 86400
     */
    dmRaidWindowSeconds?: number;
    /**
     * @minimum 0
     * @maximum 1440
     */
    dmRaidPauseDmsMinutes?: number;
    /**
     * @minimum 0
     * @maximum 100000
     */
    mentionRaidThreshold?: number;
    /**
     * @minimum 10
     * @maximum 86400
     */
    mentionRaidWindowSeconds?: number;
}

export interface AdminRaidIncidentActionSchema {
    action: "delete_messages" | "suspend" | "disable" | "ban_ip";
    /**
     * Only act on these accounts from the incident. Leave out to act on everyone in it.
     * @maxItems 2000
     */
    user_ids?: string[];
    /**
     * @maxLength 512
     */
    reason?: string;
}

export interface AdminAutomodSettingsSchema {
    spam?: AdminAutomodSpamSchema;
    raids?: AdminAutomodRaidSchema;
    slurs?: {
        enabled?: boolean;
        includeSoftA?: boolean;
        /**
         * @minimum 1
         * @maximum 365
         */
        suspendDays?: number;
        deleteAllMessages?: boolean;
        /**
         * @minimum 1
         * @maximum 3650
         */
        violationDays?: number;
        actOnVerifiedReports?: boolean;
    };
    /**
     * @maxItems 50
     */
    wordLists?: AdminAutomodWordListSchema[];
    /**
     * @maxItems 500
     */
    allowList?: string[];
    /**
     * @maxItems 256
     */
    identityBlockedTerms?: string[];
    registration?: {
        joinReasonRequired?: boolean;
        /**
         * @minimum 1
         * @maximum 1000
         */
        joinReasonMinLength?: number;
        requireApproval?: boolean;
        /**
         * @minimum 0
         * @maximum 100000
         */
        maxAccountsPerIpPerDay?: number;
    };
    login?: {
        /**
         * @minimum 0
         * @maximum 1000
         */
        maxFailedAttemptsPerAccount?: number;
        /**
         * @minimum 1
         * @maximum 10080
         */
        lockoutMinutes?: number;
    };
}

export interface AdminAutomodTestSchema {
    /**
     * @maxLength 4000
     */
    text: string;
}

export interface AdminAutomodReverseSchema {
    reversal: "undo" | "not_a_match";
}

export interface AdminAutomodUsersSchema {
    /**
     * @minItems 1
     * @maxItems 100
     */
    user_ids: string[];
}

export interface AdminJoinRequestActionSchema {
    /**
     * @minItems 1
     * @maxItems 100
     */
    user_ids: string[];
    action: "approve" | "reject";
}
