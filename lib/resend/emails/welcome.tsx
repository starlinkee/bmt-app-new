import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface WelcomeEmailProps {
  name?: string;
  appUrl?: string;
}

export function WelcomeEmail({
  name = "there",
  appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
}: WelcomeEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Welcome — you&apos;re all set up!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Welcome, {name}!</Heading>
          <Text style={text}>
            Your account is ready. Click the button below to get started.
          </Text>
          <Section style={buttonContainer}>
            <Button href={appUrl} style={button}>
              Go to app
            </Button>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>
            If you didn&apos;t create an account, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "40px auto",
  padding: "40px",
  borderRadius: "8px",
  maxWidth: "560px",
};

const h1: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#1a1a1a",
  margin: "0 0 16px",
};

const text: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#4a4a4a",
  margin: "0 0 24px",
};

const buttonContainer: React.CSSProperties = {
  textAlign: "center",
  margin: "0 0 32px",
};

const button: React.CSSProperties = {
  backgroundColor: "#000000",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "500",
  padding: "12px 24px",
  textDecoration: "none",
};

const hr: React.CSSProperties = {
  borderColor: "#e6e6e6",
  margin: "0 0 24px",
};

const footer: React.CSSProperties = {
  fontSize: "13px",
  color: "#9a9a9a",
  margin: "0",
};
