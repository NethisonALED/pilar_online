# Pilar

Pilar is a web application designed to manage the relationship between a company and its partner architects. It allows for the tracking of sales, commissions, payments, and architect performance through a point-based ranking system.

## Features

- **Architect Management:** Register, edit, and import architect data.
- **Sales Tracking:** Import sales from a spreadsheet or via API integration with Sysled.
- **Commission Calculation:** Automatically calculate commissions (RT) based on sales.
- **Payment Control:** Generate and track payments and redemptions.
- **Performance Ranking:** Rank architects based on a point system.
- **Role-Based Permissions:** Control user access to different features.
- **Event Logging:** Track all important actions performed by users.

## Setup

### Prerequisites

- A Supabase account and project.
- Environment variables for Supabase and Sysled API credentials.

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   ```

2. **Create a `.env` file:**
   In the root of the project, create a `.env` file and add the following variables:

   ```
   API_SYSLED_URL="your_sysled_api_url"
   API_SYSLED_KEY="your_sysled_api_key"
   API_SUPABASE_URL="your_supabase_project_url"
   API_SUPABASE_KEY="your_supabase_anon_key"
   ```

3. **Set up Supabase tables:**
   You will need to create the following tables in your Supabase project:
   - `arquitetos`
   - `pagamentos`
   - `arquivos_importados`
   - `comissoes_manuais`
   - `action_logs`
   - `sysled_imports`
   - `user_roles`
   - `role_permissions`

4. **Open `index.html` in your browser.**

## Usage

- **Login:** Access the application by entering your email and password.
- **Import Sales:** Use the "Importar Vendas" tab to upload a spreadsheet with sales data.
- **Consult Sysled:** Use the "Consulta Sysled" tab to fetch data directly from the Sysled API.
- **Manage Architects:** Use the "Arquitetos" tab to add, edit, or import architect data.
- **Track Payments:** Use the "Comprovantes" and "Resgates" tabs to manage payments and redemptions.
- **View Reports:** Use the "Resultados" and "Pontuação" tabs to view financial results and architect rankings.
