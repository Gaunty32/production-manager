import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2 } from "lucide-react";

type FormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
};

const EMPTY_FORM: FormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
};

export default function DemoLeadForm() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field: keyof FormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/demo/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Unable to send request");
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Book a Discovery Call</h2>
        <p className="text-muted-foreground">
          Leave your details and we'll send you instant demo access, then follow up to find a time that works.
        </p>
      </div>

      <div className="bg-card border rounded-lg p-8 shadow-sm">
        {submitted ? (
          <div className="flex flex-col items-center text-center gap-5 py-6">
            <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">You're all set!</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                We've sent a link to your inbox so you can explore the customer portal right away. Someone from the team will also be in touch shortly to book your discovery call.
              </p>
              <p className="text-muted-foreground text-sm">
                Can't see the email? Check your spam folder or request again below.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => { setSubmitted(false); setForm(EMPTY_FORM); setError(""); }}
              data-testid="button-try-again"
            >
              Send again
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2 text-sm font-medium">
                First name
                <Input
                  required
                  autoComplete="given-name"
                  placeholder="Jane"
                  value={form.firstName}
                  onChange={(event) => updateField("firstName", event.target.value)}
                  data-testid="input-first-name"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Last name
                <Input
                  required
                  autoComplete="family-name"
                  placeholder="Smith"
                  value={form.lastName}
                  onChange={(event) => updateField("lastName", event.target.value)}
                  data-testid="input-last-name"
                />
              </label>
            </div>

            <label className="space-y-2 text-sm font-medium">
              Work email
              <Input
                required
                type="email"
                autoComplete="email"
                placeholder="jane@yourcompany.com"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                data-testid="input-email"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2 text-sm font-medium">
                Phone number
                <Input
                  required
                  type="tel"
                  minLength={7}
                  autoComplete="tel"
                  placeholder="07700 900000"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  data-testid="input-phone"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Company name
                <Input
                  required
                  autoComplete="organization"
                  placeholder="Acme Ltd"
                  value={form.company}
                  onChange={(event) => updateField("company", event.target.value)}
                  data-testid="input-company"
                />
              </label>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={pending}
              data-testid="button-request-demo"
            >
              {pending ? "Sending..." : "Book a Discovery Call"}
            </Button>

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              By submitting, you agree that Select Branding Solutions may follow up with you.
              No spam, ever.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}