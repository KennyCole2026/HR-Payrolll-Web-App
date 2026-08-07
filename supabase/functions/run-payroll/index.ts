import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Invalid method" }), {
        status: 405,
      });
    }

    const body = await req.json();

    const { company_id, period, employees } = body;

    // =========================
    // VALIDATION
    // =========================

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400,
      });
    }

    if (!period) {
      return new Response(JSON.stringify({ error: "period required" }), {
        status: 400,
      });
    }

    if (!employees || !Array.isArray(employees)) {
      return new Response(JSON.stringify({ error: "employees array required" }), {
        status: 400,
      });
    }

    // =========================
    // SIMPLE PAYROLL LOGIC (TEMP)
    // =========================

    const results = employees.map((emp: any) => {
      const gross = emp.basic + (emp.allowances || 0);
      const tax = gross * 0.1; // temporary flat tax
      const net = gross - tax;

      return {
        employee_id: emp.id,
        gross,
        tax,
        net,
      };
    });

    // =========================
    // RESPONSE
    // =========================

    return new Response(
      JSON.stringify({
        success: true,
        data: results,
      }),
      { status: 200 }
    );

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
