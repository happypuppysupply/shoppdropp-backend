-- Add OpenWeb Ninja research API types to api_credentials
ALTER TABLE public.api_credentials 
DROP CONSTRAINT IF EXISTS api_credentials_type_check;

ALTER TABLE public.api_credentials 
ADD CONSTRAINT api_credentials_type_check 
CHECK (type IN ('shopify', 'meta_ads', 'autods', 'openwebninja_amazon', 'openwebninja_product_search', 'openwebninja_walmart', 'openwebninja_ecommerce', 'openwebninja_ebay', 'cj_dropshipping'));
