export declare const config: {
    port: number;
    nodeEnv: string;
    supabase: {
        url: string;
        serviceKey: string;
    };
    stripe: {
        secretKey: string;
        webhookSecret: string;
        prices: {
            payg: string;
            growth: string;
            agency: string;
        };
    };
    jwt: {
        secret: string;
    };
    worker: {
        image: string;
    };
};
//# sourceMappingURL=index.d.ts.map