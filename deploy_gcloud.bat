gcloud builds submit --tag gcr.io/loc-key-1539004550528/query
gcloud run deploy query --image gcr.io/loc-key-1539004550528/query --platform=managed