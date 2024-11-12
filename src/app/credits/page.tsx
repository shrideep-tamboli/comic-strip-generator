"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, Image } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface CreditInfo {
  type: "image";
  amount: number;
}

interface Props {
  onUpdateCredits: (newCredits: number) => void;
}

export default function Component({ onUpdateCredits }: Props) {
  const [credits, setCredits] = useState<CreditInfo[]>([]);
  const [rechargeType, setRechargeType] = useState<"image">("image");
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [calculatedCredits, setCalculatedCredits] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  const supabase = createClient();

  const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  // Load Razorpay script
  useEffect(() => {
    const loadRazorpayScript = () => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => setRazorpayLoaded(true);
      script.onerror = () => console.error("Failed to load Razorpay script");
      document.body.appendChild(script);
    };

    loadRazorpayScript();
  }, []);

  useEffect(() => {
    const fetchCredits = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && user.email) {
        setUserEmail(user.email);
        const { data, error } = await supabase
          .from("users")
          .select("image_credits")
          .eq("email", user.email)
          .single();

        if (error) {
          console.error("Error fetching user credits:", error.message);
        } else if (data) {
          setCredits([{ type: "image", amount: data.image_credits }]);
        }
      }
    };

    fetchCredits();
  }, [supabase]);

  // Calculate the credits the user will get based on the INR entered
  useEffect(() => {
    const amount = parseInt(rechargeAmount, 10);
    if (!isNaN(amount)) {
      let creditsToAdd = 0;
      let errorMessage = "";

      // Pricing structure for image credits only
      if (rechargeType === "image") {
        if (amount >= 10) {
            creditsToAdd = Math.floor(amount / 10) * 6; // 6 credits for every ₹10
        } else {
          creditsToAdd = 0; // Show error message if below minimum
          errorMessage = "Minimum recharge for images is ₹10";
        }
      }

      setCalculatedCredits(creditsToAdd);
      setErrorMessage(errorMessage);
    } else {
      setCalculatedCredits(0);
      setErrorMessage("");
    }
  }, [rechargeAmount, rechargeType]);

  // Handle Razorpay payment
  const initiatePayment = async () => {
    if (!razorpayLoaded) {
      console.error("Razorpay SDK not loaded");
      return;
    }

    const amountInPaise = parseInt(rechargeAmount, 10) * 100; // Convert to paise for Razorpay

    if (!amountInPaise || amountInPaise <= 0) return;

    const options = {
      key: RAZORPAY_KEY_ID, // Razorpay Key ID
      amount: amountInPaise,
      currency: "INR",
      name: "Credits Recharge",
      description: `Recharge for ${calculatedCredits} ${rechargeType} credits`,
      handler: async (response: any) => {
        await handleRecharge(response);
      },
      prefill: {
        email: userEmail,
      },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  // Handle recharge credits after successful payment
  const handleRecharge = async (paymentResponse: any) => {
    if (!userEmail || calculatedCredits <= 0) return;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Error retrieving user:", authError?.message);
      return;
    }

    // Update the credits in the local state and Supabase
    const updatedCredits = credits.map((credit) =>
      credit.type === rechargeType
        ? { ...credit, amount: credit.amount + calculatedCredits }
        : credit
    );
    setCredits(updatedCredits);

    const newCredits = {
      image_credits: updatedCredits.find((c) => c.type === "image")?.amount || 0,
    };

    // Call the onUpdateCredits function to sync credits
    onUpdateCredits(newCredits.image_credits);

    const { error: creditUpdateError } = await supabase
      .from("users")
      .update(newCredits)
      .eq("email", userEmail);

    if (creditUpdateError) {
      console.error("Error updating credits:", creditUpdateError.message);
      return;
    }

    // Save transaction to credit_transactions table
    const transactionData = {
      user_id: user.id,
      amount: parseInt(rechargeAmount, 10),
      transaction_type: rechargeType,
      email: userEmail,
    };

    const { error: transactionError } = await supabase
      .from("credit_transactions")
      .insert([transactionData]);

    if (transactionError) {
      console.error("Error saving transaction:", transactionError.message);
    } else {
      console.log("Transaction saved successfully:", paymentResponse);
    }
  };

  return (
    <div className="container mx-auto">
      <div className="flex items-center justify-center h-screen">
        <Card>
          <CardHeader>
            <CardTitle>Recharge Credits</CardTitle>
            <CardDescription>Add more credits to your account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="amount">Amount (INR)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount"
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                />
                {rechargeAmount &&
                  (errorMessage ? (
                    <p className="text-sm text-red-500">{errorMessage}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      You will get {calculatedCredits} {rechargeType} credits
                    </p>
                  ))}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={initiatePayment}>
              <Coins className="w-4 h-4 mr-2" />
              Recharge & Pay with Razorpay
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}