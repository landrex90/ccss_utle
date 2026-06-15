import { schedule } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

export const handler = schedule("@daily", async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabase
    .from("registros")
    .select("id_registro", { count: "exact", head: true })

  if (error) {
    console.error("[keep-alive] Supabase ping failed:", error.message)
    return { statusCode: 500 }
  }

  console.log("[keep-alive] Supabase ping OK —", new Date().toISOString())
  return { statusCode: 200 }
})
