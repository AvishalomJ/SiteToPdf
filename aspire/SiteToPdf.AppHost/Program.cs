var builder = DistributedApplication.CreateBuilder(args);

var api = builder.AddDockerfile("sitetopdf-api", "../../", "web/server/Dockerfile")
    .WithHttpEndpoint(port: 3000, targetPort: 3000, name: "http")
    .WithHttpHealthCheck("/health")
    .WithEnvironment("NODE_ENV", "production")
    .WithEnvironment("MAX_CONCURRENT_BROWSERS", "2")
    .WithEnvironment("JOB_TTL_MINUTES", "60");

builder.Build().Run();
