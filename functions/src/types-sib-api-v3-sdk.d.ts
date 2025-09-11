declare module 'sib-api-v3-sdk' {
  // Déclaration minimale pour usage courant sendTransacEmail
  namespace SibApiV3Sdk {
    interface SendSmtpEmailSender { email: string; name?: string }
    interface SendSmtpEmailTo { email: string; name?: string }
    interface SendSmtpEmail {
      sender?: SendSmtpEmailSender;
      to?: SendSmtpEmailTo[];
      subject?: string;
      htmlContent?: string;
      textContent?: string;
      templateId?: number;
      params?: Record<string, any>;
    }
    class TransactionalEmailsApi {
      constructor();
      sendTransacEmail(email: SendSmtpEmail): Promise<any>;
    }
    const ApiClient: any;
  }
  export default SibApiV3Sdk;
}
