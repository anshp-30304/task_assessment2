terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0"
}

provider "aws" {
  region = var.aws_region
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-2"
}

variable "qut_username" {
  description = "n11857374"
  type        = string
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "cab432-task-manager"
}

# Local values
locals {
  common_tags = {
    purpose      = "assessment-2"
    qut-username = "${var.qut_username}@qut.edu.au"
    project      = var.project_name
    managed-by   = "terraform"
  }
  
  resource_prefix = "${var.project_name}-${var.qut_username}"
}

# ================================
# DynamoDB Tables
# ================================

# Tasks table
resource "aws_dynamodb_table" "tasks" {
  name           = "${local.resource_prefix}-tasks"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "taskId"
  range_key      = "userId"

  attribute {
    name = "taskId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  # Global Secondary Index for querying by userId
  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  tags = local.common_tags
}

# Task assignments table
resource "aws_dynamodb_table" "task_assignments" {
  name         = "${local.resource_prefix}-assignments"
  billing_mode = "ON_DEMAND"
  hash_key     = "userId"
  range_key    = "taskId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "taskId"
    type = "S"
  }

  tags = local.common_tags
}

# ================================
# S3 Bucket
# ================================

resource "aws_s3_bucket" "task_files" {
  bucket = "${local.resource_prefix}-files"
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "task_files" {
  bucket = aws_s3_bucket.task_files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "task_files" {
  bucket = aws_s3_bucket.task_files.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = ["*"]
    expose_headers  = []
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_versioning" "task_files" {
  bucket = aws_s3_bucket.task_files.id
  
  versioning_configuration {
    status = "Disabled"
  }
}

# ================================
# Cognito User Pool
# ================================

resource "aws_cognito_user_pool" "task_users" {
  name = "${local.resource_prefix}-users"

  # Sign-in configuration
  alias_attributes = ["email"]
  username_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # User pool add-ons
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  # MFA configuration
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # User attributes
  schema {
    attribute_data_type      = "String"
    name                     = "email"
    required                 = true
    mutable                  = true
    developer_only_attribute = false
  }

  # Auto-verified attributes
  auto_verified_attributes = ["email"]

  # Email verification message
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Task Manager - Verify your email"
    email_message        = "Your verification code is {####}. Please enter this code in the application to verify your email."
  }

  tags = local.common_tags
}

# User pool client
resource "aws_cognito_user_pool_client" "task_client" {
  name         = "${local.resource_prefix}-client"
  user_pool_id = aws_cognito_user_pool.task_users.id

  generate_secret = true

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Token validity
  access_token_validity  = 60    # 1 hour
  id_token_validity      = 60    # 1 hour
  refresh_token_validity = 30    # 30 days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"

  # Read and write attributes
  read_attributes = [
    "email",
    "email_verified"
  ]

  write_attributes = [
    "email"
  ]
}

# Admin user group
resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.task_users.id
  description  = "Administrator group with elevated permissions"
  precedence   = 1
}

# Regular user group
resource "aws_cognito_user_group" "users" {
  name         = "users"
  user_pool_id = aws_cognito_user_pool.task_users.id
  description  = "Regular users group"
  precedence   = 2
}

# ================================
# ElastiCache Redis
# ================================

resource "aws_elasticache_subnet_group" "task_cache" {
  name       = "${local.resource_prefix}-cache-subnet"
  subnet_ids = data.aws_subnets.default.ids

  tags = local.common_tags
}

resource "aws_elasticache_replication_group" "task_cache" {
  replication_group_id       = "${local.resource_prefix}-cache"
  description                = "Redis cache for task manager"
  
  port                       = 6379
  parameter_group_name       = "default.redis7"
  node_type                  = "cache.t3.micro"
  num_cache_clusters         = 1
  
  engine_version             = "7.0"
  
  subnet_group_name          = aws_elasticache_subnet_group.task_cache.name
  security_group_ids         = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false  # Disabled for simplicity in development
  
  tags = local.common_tags
}

# Security group for Redis
resource "aws_security_group" "redis" {
  name_prefix = "${local.resource_prefix}-redis"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.resource_prefix}-redis-sg"
  })
}

# ================================
# Parameter Store
# ================================

resource "aws_ssm_parameter" "api_url" {
  name  = "/cab432/task-manager/api-url"
  type  = "String"
  value = "https://${var.qut_username}-tasks.cab432.com"
  
  description = "API URL for the task manager application"
  tags        = local.common_tags
}

resource "aws_ssm_parameter" "frontend_url" {
  name  = "/cab432/task-manager/frontend-url"
  type  = "String"
  value = "https://${var.qut_username}-tasks.cab432.com"
  
  description = "Frontend URL for the task manager application"
  tags        = local.common_tags
}

resource "aws_ssm_parameter" "app_version" {
  name  = "/cab432/task-manager/app-version"
  type  = "String"
  value = "1.0.0"
  
  description = "Current version of the task manager application"
  tags        = local.common_tags
}

resource "aws_ssm_parameter" "cache_ttl" {
  name  = "/cab432/task-manager/cache-ttl"
  type  = "String"
  value = "300"
  
  description = "Cache TTL in seconds"
  tags        = local.common_tags
}

# ================================
# Secrets Manager
# ================================

resource "aws_secretsmanager_secret" "cognito_client_secret" {
  name                    = "cab432/task-manager/cognito-client-secret"
  description             = "Cognito app client secret"
  recovery_window_in_days = 7
  
  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "cognito_client_secret" {
  secret_id     = aws_secretsmanager_secret.cognito_client_secret.id
  secret_string = aws_cognito_user_pool_client.task_client.client_secret
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "cab432/task-manager/jwt-secret"
  description             = "JWT signing secret"
  recovery_window_in_days = 7
  
  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

# ================================
# IAM Role for EC2
# ================================

resource "aws_iam_role" "ec2_task_manager_role" {
  name = "${local.resource_prefix}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "ec2_task_manager_policy" {
  name = "${local.resource_prefix}-ec2-policy"
  role = aws_iam_role.ec2_task_manager_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          aws_dynamodb_table.tasks.arn,
          "${aws_dynamodb_table.tasks.arn}/*",
          aws_dynamodb_table.task_assignments.arn,
          "${aws_dynamodb_table.task_assignments.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.task_files.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.task_files.arn
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:ListUsers"
        ]
        Resource = aws_cognito_user_pool.task_users.arn
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/cab432/task-manager/*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.cognito_client_secret.arn,
          aws_secretsmanager_secret.jwt_secret.arn
        ]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_task_manager_profile" {
  name = "${local.resource_prefix}-ec2-profile"
  role = aws_iam_role.ec2_task_manager_role.name

  tags = local.common_tags
}

# ================================
# Data Sources
# ================================

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ================================
# Outputs
# ================================

output "dynamodb_tasks_table" {
  description = "DynamoDB tasks table name"
  value       = aws_dynamodb_table.tasks.name
}

output "dynamodb_assignments_table" {
  description = "DynamoDB assignments table name"
  value       = aws_dynamodb_table.task_assignments.name
}

output "s3_bucket" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.task_files.bucket
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.task_users.id
}

output "cognito_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.task_client.id
}

output "cognito_client_secret" {
  description = "Cognito User Pool Client Secret"
  value       = aws_cognito_user_pool_client.task_client.client_secret
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = aws_elasticache_replication_group.task_cache.primary_endpoint_address
}

output "iam_instance_profile" {
  description = "IAM instance profile name for EC2"
  value       = aws_iam_instance_profile.ec2_task_manager_profile.name
}

output "deployment_environment_variables" {
  description = "Environment variables for deployment"
  value = {
    AWS_REGION                    = var.aws_region
    DYNAMODB_TASKS_TABLE         = aws_dynamodb_table.tasks.name
    DYNAMODB_ASSIGNMENTS_TABLE   = aws_dynamodb_table.task_assignments.name
    S3_BUCKET                    = aws_s3_bucket.task_files.bucket
    COGNITO_USER_POOL_ID         = aws_cognito_user_pool.task_users.id
    COGNITO_CLIENT_ID            = aws_cognito_user_pool_client.task_client.id
    REDIS_HOST                   = aws_elasticache_replication_group.task_cache.primary_endpoint_address
  }
  sensitive = false
}


