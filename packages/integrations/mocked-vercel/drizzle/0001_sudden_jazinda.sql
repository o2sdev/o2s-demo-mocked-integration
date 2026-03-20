CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"price_value" numeric NOT NULL,
	"subtotal_value" numeric DEFAULT '0' NOT NULL,
	"discount_total_value" numeric DEFAULT '0' NOT NULL,
	"total_value" numeric DEFAULT '0' NOT NULL,
	"unit" text,
	"currency" text NOT NULL,
	"product" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_due_date" timestamp with time zone,
	"currency" text NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"payment_status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"subtotal" numeric DEFAULT '0' NOT NULL,
	"shipping_total" numeric DEFAULT '0' NOT NULL,
	"shipping_subtotal" numeric DEFAULT '0' NOT NULL,
	"discount_total" numeric DEFAULT '0' NOT NULL,
	"tax" numeric DEFAULT '0' NOT NULL,
	"total" numeric DEFAULT '0' NOT NULL,
	"shipping_address" jsonb,
	"billing_address" jsonb,
	"shipping_methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_comment" text,
	"email" text,
	"purchase_order_number" text
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;