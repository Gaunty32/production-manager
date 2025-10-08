import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Factory, Calendar, Users, TrendingUp } from "lucide-react";
import logoImage from "@assets/Selectuniforms960_1759932224049.jpg";
import { useLocation } from "wouter";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img 
              src={logoImage} 
              alt="Select Uniforms" 
              className="h-8 object-contain"
              data-testid="logo-icon"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => setLocation("/dashboard")}
              data-testid="button-skip-login"
            >
              Continue Without Login
            </Button>
            <Button onClick={() => window.location.href = "/api/login"} data-testid="button-login">
              Sign In
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="max-w-4xl w-full space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">
              Streamline Your Production Workflow
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Track customer orders, manage machine schedules, and ensure on-time delivery with our comprehensive production management system.
            </p>
            <div className="pt-4 flex gap-3 justify-center">
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-continue-guest"
              >
                Continue as Guest
              </Button>
              <Button 
                size="lg" 
                onClick={() => window.location.href = "/api/login"}
                data-testid="button-get-started"
              >
                Get Started
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 pt-8">
            <Card>
              <CardHeader>
                <Calendar className="h-10 w-10 mb-2 text-primary" />
                <CardTitle>Order Tracking</CardTitle>
                <CardDescription>
                  Monitor customer orders with dates received, required dispatch dates, and completion status
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <Factory className="h-10 w-10 mb-2 text-primary" />
                <CardTitle>Machine Scheduling</CardTitle>
                <CardDescription>
                  Assign jobs to 5 different machines and track production across your facility
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 mb-2 text-primary" />
                <CardTitle>Priority Queue</CardTitle>
                <CardDescription>
                  View jobs ordered by dispatch deadline to ensure timely completion
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Production Management System
        </div>
      </footer>
    </div>
  );
}
