module.exports = (req, res) => {
  const fallbackUrl = 'https://lstijgjezckxqspfyvyv.supabase.co';
  const fallbackAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdGlqZ2plemNreHFzcGZ5dnl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjA0MjcsImV4cCI6MjA4NjAzNjQyN30.Gi4zsOjSpxep-tZL_2oRAPhW9QvE1QlXLyfTAFJlQbU';

  const url = process.env.SUPABASE_URL || fallbackUrl;
  const anonKey = process.env.SUPABASE_ANON_KEY || fallbackAnonKey;

  res.status(200).json({
    supabaseUrl: url,
    supabaseAnonKey: anonKey
  });
};
