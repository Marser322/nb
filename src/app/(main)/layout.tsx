import { WelcomeModal } from "@/components/onboarding/WelcomeModal";

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            {children}
            <WelcomeModal role="cliente" />
        </>
    );
}
