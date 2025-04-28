/*
  # Create storage bucket for logos

  1. Changes
    - Create a new public storage bucket for logos
    - Set up storage policies for the bucket
    - Enable public access for logo URLs

  2. Security
    - Only authenticated users can upload logos
    - Anyone can view logos (public access)
    - Users can only update/delete their own logos
*/

-- Enable storage by creating the logos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Policy for inserting logos (authenticated users only)
CREATE POLICY "Users can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos');

-- Policy for updating logos (own logos only)
CREATE POLICY "Users can update own logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for deleting logos (own logos only)
CREATE POLICY "Users can delete own logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy for viewing logos (public)
CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'logos');