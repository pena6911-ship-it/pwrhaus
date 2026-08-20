-- Pre-seed one site_content row per public page so the dashboard shows the
-- current hero copy on first load. Idempotent. events_page is seeded by 0003.
insert into site_content (key, value) values
('home_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Co-ed &middot; Fort Lauderdale &amp; Miami',
  'heading','Never golfed?<br>Perfect.',
  'lead','Most of our members hadn''t either. They came for the business. They stayed for the game.',
  'video','/img/Golfmiami_aerial.mp4',
  'poster','/img/groupgolf1.jpg'))),
('membership_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Membership',
  'heading','Three ways in.',
  'lead','Start free and look around. Join when it''s obviously worth it.',
  'image','/img/membership-hero.jpg',
  'position','50% 65%'))),
('lessons_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Lessons',
  'heading','You don''t need to know how to play.',
  'lead','Most PWRHaus members had never held a club before joining. Now they play. That is the entire point of this.',
  'image','/img/lessons-hero.jpg',
  'position','50% 55%'))),
('corporate_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Corporate',
  'heading','Bring the simulator to your conference.',
  'lead','We run golf experiences at corporate events &mdash; sales conferences, offsites, client days. It works because it gives people something to do together that isn''t a name badge and a canap&eacute;.',
  'image','/img/corporate-hero.webp',
  'position','50% 40%'))),
('sponsors_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','Sponsorship',
  'heading','Put your brand in the room.',
  'lead','PWRHaus events are founders, owners and operators &mdash; the audience most sponsorship budgets are aiming at and usually miss.',
  'image','/img/sponsors-hero.jpg',
  'position','50% 55%'))),
('about_page', jsonb_build_object('hero', jsonb_build_object(
  'eyebrow','About',
  'heading','We started because the deals were happening somewhere we weren''t.',
  'lead','PWRHaus began as a women''s golf society and became something broader: a co-ed network of founders and owners who do business on a golf course.',
  'image','/img/groupgolf1.jpg',
  'position','50% 60%')))
on conflict (key) do nothing;
