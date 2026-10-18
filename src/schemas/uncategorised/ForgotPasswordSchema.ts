export interface ForgotPasswordSchema {
    /**
     * @maxLength 320
     */
    login: string;
    /**
     * @maxLength 8192
     */
    captcha_key?: string;
}
