CREATE TABLE "cart_items" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL,
	"price_value" numeric NOT NULL,
	"subtotal_value" numeric NOT NULL,
	"discount_total_value" numeric DEFAULT '0' NOT NULL,
	"total_value" numeric NOT NULL,
	"unit" text,
	"currency" text NOT NULL,
	"product" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"region_id" text,
	"currency" text NOT NULL,
	"email" text,
	"notes" text,
	"shipping_address" jsonb,
	"billing_address" jsonb,
	"shipping_method" jsonb,
	"payment_method" jsonb,
	"promotions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"subtotal" numeric DEFAULT '0' NOT NULL,
	"discount_total" numeric DEFAULT '0' NOT NULL,
	"tax_total" numeric DEFAULT '0' NOT NULL,
	"shipping_total" numeric DEFAULT '0' NOT NULL,
	"total" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;