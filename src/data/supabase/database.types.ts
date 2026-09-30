
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "adjustment_factors": {
                  Row: {
                    "computed_at": string,"ex_date": string,"factor_kind": string,"input_source": string,"method": string,"price_factor": number,"reference_close": number | null,"reference_date": string | null,"security_id": string,"volume_factor": number
                  }
                  Insert: {
                    "computed_at"?: string,"ex_date": string,"factor_kind": string,"input_source": string,"method": string,"price_factor": number,"reference_close"?: number | null,"reference_date"?: string | null,"security_id": string,"volume_factor": number
                  }
                  Update: {
                    "computed_at"?: string,"ex_date"?: string,"factor_kind"?: string,"input_source"?: string,"method"?: string,"price_factor"?: number,"reference_close"?: number | null,"reference_date"?: string | null,"security_id"?: string,"volume_factor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "adjustment_factors_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "adjustment_factors_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "adjustment_factors_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"ai_outputs": {
                  Row: {
                    "cache_key": string,"cached_input_tokens": number,"cost_usd": number,"created_at": string,"expires_at": string | null,"id": number,"input_hash": string,"input_tokens": number,"model": string,"output": Json | null,"output_tokens": number,"prompt_version": string,"provider": string,"status": string,"subject": string,"task": string,"validation": NonNullable<Json>
                  }
                  Insert: {
                    "cache_key": string,"cached_input_tokens"?: number,"cost_usd"?: number,"created_at"?: string,"expires_at"?: string | null,"id"?: never,"input_hash": string,"input_tokens"?: number,"model": string,"output"?: Json | null,"output_tokens"?: number,"prompt_version": string,"provider": string,"status": string,"subject": string,"task": string,"validation"?: NonNullable<Json>
                  }
                  Update: {
                    "cache_key"?: string,"cached_input_tokens"?: number,"cost_usd"?: number,"created_at"?: string,"expires_at"?: string | null,"id"?: never,"input_hash"?: string,"input_tokens"?: number,"model"?: string,"output"?: Json | null,"output_tokens"?: number,"prompt_version"?: string,"provider"?: string,"status"?: string,"subject"?: string,"task"?: string,"validation"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"canonical_line_items": {
                  Row: {
                    "code": string,"created_at": string,"description": string,"label": string,"nature": string,"sort_order": number,"statement": string,"unit": string,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"description": string,"label": string,"nature": string,"sort_order": number,"statement": string,"unit": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string,"label"?: string,"nature"?: string,"sort_order"?: number,"statement"?: string,"unit"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"companies": {
                  Row: {
                    "cik": string | null,"created_at": string,"dataset_id": string | null,"description": string | null,"domicile_country_code": string | null,"employees": number | null,"founded_year": number | null,"hq_city": string | null,"hq_country_code": string | null,"hq_region": string | null,"id": string,"is_active": boolean,"legal_name": string | null,"lei": string | null,"logo_url": string | null,"name": string,"slug": string,"sub_industry_id": string | null,"updated_at": string,"website": string | null
                  }
                  Insert: {
                    "cik"?: string | null,"created_at"?: string,"dataset_id"?: string | null,"description"?: string | null,"domicile_country_code"?: string | null,"employees"?: number | null,"founded_year"?: number | null,"hq_city"?: string | null,"hq_country_code"?: string | null,"hq_region"?: string | null,"id"?: string,"is_active"?: boolean,"legal_name"?: string | null,"lei"?: string | null,"logo_url"?: string | null,"name": string,"slug": string,"sub_industry_id"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "cik"?: string | null,"created_at"?: string,"dataset_id"?: string | null,"description"?: string | null,"domicile_country_code"?: string | null,"employees"?: number | null,"founded_year"?: number | null,"hq_city"?: string | null,"hq_country_code"?: string | null,"hq_region"?: string | null,"id"?: string,"is_active"?: boolean,"legal_name"?: string | null,"lei"?: string | null,"logo_url"?: string | null,"name"?: string,"slug"?: string,"sub_industry_id"?: string | null,"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "companies_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "companies_domicile_country_code_fkey"
      columns: ["domicile_country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "companies_hq_country_code_fkey"
      columns: ["hq_country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "companies_sub_industry_id_fkey"
      columns: ["sub_industry_id"]
isOneToOne: false
      referencedRelation: "sub_industries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "companies_sub_industry_id_fkey"
      columns: ["sub_industry_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["sub_industry_id"]
    },{
      foreignKeyName: "companies_sub_industry_id_fkey"
      columns: ["sub_industry_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["sub_industry_id"]
    }
                  ]
                },"company_fundamental_snapshots": {
                  Row: {
                    "as_of_period_end": string | null,"company_id": string,"computed_at": string,"dataset_id": string,"eps_growth": number | null,"fcf_margin": number | null,"gross_margin": number | null,"industry_template": string,"net_income_growth": number | null,"net_income_ttm": number | null,"net_margin": number | null,"operating_margin": number | null,"revenue_growth": number | null,"revenue_ttm": number | null,"roe": number | null,"roic": number | null,"source": string
                  }
                  Insert: {
                    "as_of_period_end"?: string | null,"company_id": string,"computed_at"?: string,"dataset_id": string,"eps_growth"?: number | null,"fcf_margin"?: number | null,"gross_margin"?: number | null,"industry_template": string,"net_income_growth"?: number | null,"net_income_ttm"?: number | null,"net_margin"?: number | null,"operating_margin"?: number | null,"revenue_growth"?: number | null,"revenue_ttm"?: number | null,"roe"?: number | null,"roic"?: number | null,"source": string
                  }
                  Update: {
                    "as_of_period_end"?: string | null,"company_id"?: string,"computed_at"?: string,"dataset_id"?: string,"eps_growth"?: number | null,"fcf_margin"?: number | null,"gross_margin"?: number | null,"industry_template"?: string,"net_income_growth"?: number | null,"net_income_ttm"?: number | null,"net_margin"?: number | null,"operating_margin"?: number | null,"revenue_growth"?: number | null,"revenue_ttm"?: number | null,"roe"?: number | null,"roic"?: number | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_fundamental_snapshots_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_fundamental_snapshots_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "company_fundamental_snapshots_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "company_fundamental_snapshots_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    }
                  ]
                },"company_themes": {
                  Row: {
                    "company_id": string,"confidence": number | null,"created_at": string,"dataset_id": string | null,"note": string | null,"source": string,"theme_id": string,"updated_at": string
                  }
                  Insert: {
                    "company_id": string,"confidence"?: number | null,"created_at"?: string,"dataset_id"?: string | null,"note"?: string | null,"source": string,"theme_id": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"confidence"?: number | null,"created_at"?: string,"dataset_id"?: string | null,"note"?: string | null,"source"?: string,"theme_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_themes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_themes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "company_themes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "company_themes_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_themes_theme_id_fkey"
      columns: ["theme_id"]
isOneToOne: false
      referencedRelation: "themes"
      referencedColumns: ["id"]
    }
                  ]
                },"corporate_actions": {
                  Row: {
                    "action_type": string,"cash_amount": number | null,"currency": string | null,"dataset_id": string,"declaration_date": string | null,"ex_date": string,"frequency": string | null,"id": string,"ingested_at": string,"payment_date": string | null,"provider_adjusted_amount": number | null,"provider_label": string | null,"record_date": string | null,"security_id": string,"source": string,"split_from": number | null,"split_to": number | null,"support_status": string,"unsupported_reason": string | null
                  }
                  Insert: {
                    "action_type": string,"cash_amount"?: number | null,"currency"?: string | null,"dataset_id": string,"declaration_date"?: string | null,"ex_date": string,"frequency"?: string | null,"id"?: string,"ingested_at"?: string,"payment_date"?: string | null,"provider_adjusted_amount"?: number | null,"provider_label"?: string | null,"record_date"?: string | null,"security_id": string,"source": string,"split_from"?: number | null,"split_to"?: number | null,"support_status": string,"unsupported_reason"?: string | null
                  }
                  Update: {
                    "action_type"?: string,"cash_amount"?: number | null,"currency"?: string | null,"dataset_id"?: string,"declaration_date"?: string | null,"ex_date"?: string,"frequency"?: string | null,"id"?: string,"ingested_at"?: string,"payment_date"?: string | null,"provider_adjusted_amount"?: number | null,"provider_label"?: string | null,"record_date"?: string | null,"security_id"?: string,"source"?: string,"split_from"?: number | null,"split_to"?: number | null,"support_status"?: string,"unsupported_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "corporate_actions_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "corporate_actions_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "corporate_actions_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "corporate_actions_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"countries": {
                  Row: {
                    "code": string,"created_at": string,"iso_numeric": string,"iso3": string,"name": string,"region": string | null,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"iso_numeric": string,"iso3": string,"name": string,"region"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"iso_numeric"?: string,"iso3"?: string,"name"?: string,"region"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"daily_bars": {
                  Row: {
                    "close": number,"high": number,"low": number,"open": number,"provider_adjusted_close": number | null,"series_id": number,"trade_date": string,"volume": number | null
                  }
                  Insert: {
                    "close": number,"high": number,"low": number,"open": number,"provider_adjusted_close"?: number | null,"series_id": number,"trade_date": string,"volume"?: number | null
                  }
                  Update: {
                    "close"?: number,"high"?: number,"low"?: number,"open"?: number,"provider_adjusted_close"?: number | null,"series_id"?: number,"trade_date"?: string,"volume"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_bars_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "price_series"
      referencedColumns: ["id"]
    }
                  ]
                },"datasets": {
                  Row: {
                    "created_at": string,"effective_date": string | null,"id": string,"is_secondary_source": boolean,"key": string,"license": string | null,"name": string,"notes": string | null,"retrieved_at": string | null,"sha256": string | null,"source": string,"source_revision": string | null,"source_revision_at": string | null,"source_url": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"effective_date"?: string | null,"id"?: string,"is_secondary_source"?: boolean,"key": string,"license"?: string | null,"name": string,"notes"?: string | null,"retrieved_at"?: string | null,"sha256"?: string | null,"source": string,"source_revision"?: string | null,"source_revision_at"?: string | null,"source_url"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"effective_date"?: string | null,"id"?: string,"is_secondary_source"?: boolean,"key"?: string,"license"?: string | null,"name"?: string,"notes"?: string | null,"retrieved_at"?: string | null,"sha256"?: string | null,"source"?: string,"source_revision"?: string | null,"source_revision_at"?: string | null,"source_url"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"earnings_estimates": {
                  Row: {
                    "as_of_date": string | null,"company_id": string,"dataset_id": string,"eps_analysts": number | null,"eps_avg": number | null,"eps_high": number | null,"eps_low": number | null,"eps_year_ago": number | null,"ingested_at": string,"period_code": string,"period_end": string,"revenue_analysts": number | null,"revenue_avg": number | null,"revenue_high": number | null,"revenue_low": number | null,"source": string,"source_security_id": string | null
                  }
                  Insert: {
                    "as_of_date"?: string | null,"company_id": string,"dataset_id": string,"eps_analysts"?: number | null,"eps_avg"?: number | null,"eps_high"?: number | null,"eps_low"?: number | null,"eps_year_ago"?: number | null,"ingested_at"?: string,"period_code": string,"period_end": string,"revenue_analysts"?: number | null,"revenue_avg"?: number | null,"revenue_high"?: number | null,"revenue_low"?: number | null,"source": string,"source_security_id"?: string | null
                  }
                  Update: {
                    "as_of_date"?: string | null,"company_id"?: string,"dataset_id"?: string,"eps_analysts"?: number | null,"eps_avg"?: number | null,"eps_high"?: number | null,"eps_low"?: number | null,"eps_year_ago"?: number | null,"ingested_at"?: string,"period_code"?: string,"period_end"?: string,"revenue_analysts"?: number | null,"revenue_avg"?: number | null,"revenue_high"?: number | null,"revenue_low"?: number | null,"source"?: string,"source_security_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "earnings_estimates_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_estimates_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "earnings_estimates_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "earnings_estimates_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_estimates_source_security_id_fkey"
      columns: ["source_security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_estimates_source_security_id_fkey"
      columns: ["source_security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "earnings_estimates_source_security_id_fkey"
      columns: ["source_security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"earnings_events": {
                  Row: {
                    "company_id": string,"currency": string | null,"dataset_id": string,"eps_basis": string,"fiscal_period_end": string,"ingested_at": string,"provider_eps_actual": number | null,"provider_eps_estimate": number | null,"provider_eps_surprise": number | null,"provider_eps_surprise_percent": number | null,"report_date": string | null,"report_timing": string | null,"source": string,"source_security_id": string | null
                  }
                  Insert: {
                    "company_id": string,"currency"?: string | null,"dataset_id": string,"eps_basis"?: string,"fiscal_period_end": string,"ingested_at"?: string,"provider_eps_actual"?: number | null,"provider_eps_estimate"?: number | null,"provider_eps_surprise"?: number | null,"provider_eps_surprise_percent"?: number | null,"report_date"?: string | null,"report_timing"?: string | null,"source": string,"source_security_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"currency"?: string | null,"dataset_id"?: string,"eps_basis"?: string,"fiscal_period_end"?: string,"ingested_at"?: string,"provider_eps_actual"?: number | null,"provider_eps_estimate"?: number | null,"provider_eps_surprise"?: number | null,"provider_eps_surprise_percent"?: number | null,"report_date"?: string | null,"report_timing"?: string | null,"source"?: string,"source_security_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "earnings_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "earnings_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "earnings_events_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_events_source_security_id_fkey"
      columns: ["source_security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "earnings_events_source_security_id_fkey"
      columns: ["source_security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "earnings_events_source_security_id_fkey"
      columns: ["source_security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"exchanges": {
                  Row: {
                    "acronym": string | null,"country_code": string,"created_at": string,"currency": string,"dataset_id": string | null,"id": string,"mic": string,"name": string,"timezone": string,"updated_at": string
                  }
                  Insert: {
                    "acronym"?: string | null,"country_code": string,"created_at"?: string,"currency": string,"dataset_id"?: string | null,"id"?: string,"mic": string,"name": string,"timezone": string,"updated_at"?: string
                  }
                  Update: {
                    "acronym"?: string | null,"country_code"?: string,"created_at"?: string,"currency"?: string,"dataset_id"?: string | null,"id"?: string,"mic"?: string,"name"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exchanges_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "exchanges_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    }
                  ]
                },"financial_statement_values": {
                  Row: {
                    "accession_number": string | null,"company_id": string,"currency": string | null,"dataset_id": string,"derivation": string | null,"filing_date": string | null,"fiscal_period_end": string,"fiscal_quarter": number | null,"fiscal_year": number | null,"form": string | null,"ingested_at": string,"line_item_code": string,"missing_reason": string | null,"period_start": string | null,"period_type": string,"restated": boolean,"source": string,"source_field": string,"source_security_id": string | null,"value": number | null,"value_origin": string
                  }
                  Insert: {
                    "accession_number"?: string | null,"company_id": string,"currency"?: string | null,"dataset_id": string,"derivation"?: string | null,"filing_date"?: string | null,"fiscal_period_end": string,"fiscal_quarter"?: number | null,"fiscal_year"?: number | null,"form"?: string | null,"ingested_at"?: string,"line_item_code": string,"missing_reason"?: string | null,"period_start"?: string | null,"period_type": string,"restated"?: boolean,"source": string,"source_field": string,"source_security_id"?: string | null,"value"?: number | null,"value_origin"?: string
                  }
                  Update: {
                    "accession_number"?: string | null,"company_id"?: string,"currency"?: string | null,"dataset_id"?: string,"derivation"?: string | null,"filing_date"?: string | null,"fiscal_period_end"?: string,"fiscal_quarter"?: number | null,"fiscal_year"?: number | null,"form"?: string | null,"ingested_at"?: string,"line_item_code"?: string,"missing_reason"?: string | null,"period_start"?: string | null,"period_type"?: string,"restated"?: boolean,"source"?: string,"source_field"?: string,"source_security_id"?: string | null,"value"?: number | null,"value_origin"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "financial_statement_values_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "financial_statement_values_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "financial_statement_values_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "financial_statement_values_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "financial_statement_values_line_item_code_fkey"
      columns: ["line_item_code"]
isOneToOne: false
      referencedRelation: "canonical_line_items"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "financial_statement_values_source_security_id_fkey"
      columns: ["source_security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "financial_statement_values_source_security_id_fkey"
      columns: ["source_security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "financial_statement_values_source_security_id_fkey"
      columns: ["source_security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"fundamental_coverage": {
                  Row: {
                    "annual_periods": number,"company_id": string,"concepts": (string)[],"dataset_id": string,"ingested_at": string,"latest_period_end": string | null,"line_item_code": string,"quarterly_periods": number,"reason": string | null,"source": string,"status": string
                  }
                  Insert: {
                    "annual_periods"?: number,"company_id": string,"concepts"?: (string)[],"dataset_id": string,"ingested_at"?: string,"latest_period_end"?: string | null,"line_item_code": string,"quarterly_periods"?: number,"reason"?: string | null,"source": string,"status": string
                  }
                  Update: {
                    "annual_periods"?: number,"company_id"?: string,"concepts"?: (string)[],"dataset_id"?: string,"ingested_at"?: string,"latest_period_end"?: string | null,"line_item_code"?: string,"quarterly_periods"?: number,"reason"?: string | null,"source"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fundamental_coverage_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fundamental_coverage_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "fundamental_coverage_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "fundamental_coverage_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fundamental_coverage_line_item_code_fkey"
      columns: ["line_item_code"]
isOneToOne: false
      referencedRelation: "canonical_line_items"
      referencedColumns: ["code"]
    }
                  ]
                },"group_index_series": {
                  Row: {
                    "computed_at": string,"end_date": string,"exchange_mic": string,"group_key": string,"group_kind": string,"levels": (number)[],"members_last": number,"members_total": number,"method": string,"source": string,"start_date": string
                  }
                  Insert: {
                    "computed_at"?: string,"end_date": string,"exchange_mic": string,"group_key": string,"group_kind": string,"levels": (number)[],"members_last": number,"members_total": number,"method": string,"source": string,"start_date": string
                  }
                  Update: {
                    "computed_at"?: string,"end_date"?: string,"exchange_mic"?: string,"group_key"?: string,"group_kind"?: string,"levels"?: (number)[],"members_last"?: number,"members_total"?: number,"method"?: string,"source"?: string,"start_date"?: string
                  }
                  Relationships: [
                    
                  ]
                },"index_constituents": {
                  Row: {
                    "added_on": string | null,"created_at": string,"dataset_id": string,"id": string,"index_id": string,"removed_on": string | null,"security_id": string,"updated_at": string,"weight": number | null
                  }
                  Insert: {
                    "added_on"?: string | null,"created_at"?: string,"dataset_id": string,"id"?: string,"index_id": string,"removed_on"?: string | null,"security_id": string,"updated_at"?: string,"weight"?: number | null
                  }
                  Update: {
                    "added_on"?: string | null,"created_at"?: string,"dataset_id"?: string,"id"?: string,"index_id"?: string,"removed_on"?: string | null,"security_id"?: string,"updated_at"?: string,"weight"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "index_constituents_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "index_constituents_index_id_fkey"
      columns: ["index_id"]
isOneToOne: false
      referencedRelation: "indices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "index_constituents_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "index_constituents_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "index_constituents_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"indices": {
                  Row: {
                    "base_date": string | null,"base_value": number | null,"code": string,"constituents_tracked": boolean,"country_code": string | null,"created_at": string,"currency": string | null,"dataset_id": string | null,"description": string | null,"id": string,"is_active": boolean,"kind": string,"methodology": string,"name": string,"provider": string,"scope_industry_group_id": string | null,"scope_industry_id": string | null,"scope_sector_id": string | null,"scope_sub_industry_id": string | null,"short_name": string | null,"slug": string,"updated_at": string
                  }
                  Insert: {
                    "base_date"?: string | null,"base_value"?: number | null,"code": string,"constituents_tracked"?: boolean,"country_code"?: string | null,"created_at"?: string,"currency"?: string | null,"dataset_id"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"kind": string,"methodology": string,"name": string,"provider": string,"scope_industry_group_id"?: string | null,"scope_industry_id"?: string | null,"scope_sector_id"?: string | null,"scope_sub_industry_id"?: string | null,"short_name"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "base_date"?: string | null,"base_value"?: number | null,"code"?: string,"constituents_tracked"?: boolean,"country_code"?: string | null,"created_at"?: string,"currency"?: string | null,"dataset_id"?: string | null,"description"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: string,"methodology"?: string,"name"?: string,"provider"?: string,"scope_industry_group_id"?: string | null,"scope_industry_id"?: string | null,"scope_sector_id"?: string | null,"scope_sub_industry_id"?: string | null,"short_name"?: string | null,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "indices_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "indices_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "indices_scope_industry_group_id_fkey"
      columns: ["scope_industry_group_id"]
isOneToOne: false
      referencedRelation: "industry_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "indices_scope_industry_group_id_fkey"
      columns: ["scope_industry_group_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["industry_group_id"]
    },{
      foreignKeyName: "indices_scope_industry_group_id_fkey"
      columns: ["scope_industry_group_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["industry_group_id"]
    },{
      foreignKeyName: "indices_scope_industry_id_fkey"
      columns: ["scope_industry_id"]
isOneToOne: false
      referencedRelation: "industries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "indices_scope_industry_id_fkey"
      columns: ["scope_industry_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["industry_id"]
    },{
      foreignKeyName: "indices_scope_industry_id_fkey"
      columns: ["scope_industry_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["industry_id"]
    },{
      foreignKeyName: "indices_scope_sector_id_fkey"
      columns: ["scope_sector_id"]
isOneToOne: false
      referencedRelation: "sectors"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "indices_scope_sector_id_fkey"
      columns: ["scope_sector_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["sector_id"]
    },{
      foreignKeyName: "indices_scope_sector_id_fkey"
      columns: ["scope_sector_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["sector_id"]
    },{
      foreignKeyName: "indices_scope_sub_industry_id_fkey"
      columns: ["scope_sub_industry_id"]
isOneToOne: false
      referencedRelation: "sub_industries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "indices_scope_sub_industry_id_fkey"
      columns: ["scope_sub_industry_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["sub_industry_id"]
    },{
      foreignKeyName: "indices_scope_sub_industry_id_fkey"
      columns: ["scope_sub_industry_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["sub_industry_id"]
    }
                  ]
                },"industries": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"industry_group_id": string,"name": string,"slug": string,"taxonomy_code": string,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"industry_group_id": string,"name": string,"slug": string,"taxonomy_code": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"industry_group_id"?: string,"name"?: string,"slug"?: string,"taxonomy_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "industries_industry_group_id_taxonomy_code_fkey"
      columns: ["industry_group_id","taxonomy_code"]
isOneToOne: false
      referencedRelation: "industry_groups"
      referencedColumns: ["id","taxonomy_code"]
    },{
      foreignKeyName: "industries_taxonomy_code_fkey"
      columns: ["taxonomy_code"]
isOneToOne: false
      referencedRelation: "taxonomies"
      referencedColumns: ["code"]
    }
                  ]
                },"industry_groups": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string,"sector_id": string,"slug": string,"taxonomy_code": string,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string,"sector_id": string,"slug": string,"taxonomy_code": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"sector_id"?: string,"slug"?: string,"taxonomy_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "industry_groups_sector_id_taxonomy_code_fkey"
      columns: ["sector_id","taxonomy_code"]
isOneToOne: false
      referencedRelation: "sectors"
      referencedColumns: ["id","taxonomy_code"]
    },{
      foreignKeyName: "industry_groups_sector_id_taxonomy_code_fkey"
      columns: ["sector_id","taxonomy_code"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["sector_id","taxonomy_code"]
    },{
      foreignKeyName: "industry_groups_sector_id_taxonomy_code_fkey"
      columns: ["sector_id","taxonomy_code"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["sector_id","taxonomy_code"]
    },{
      foreignKeyName: "industry_groups_taxonomy_code_fkey"
      columns: ["taxonomy_code"]
isOneToOne: false
      referencedRelation: "taxonomies"
      referencedColumns: ["code"]
    }
                  ]
                },"market_sessions": {
                  Row: {
                    "closes_at": string,"exchange_mic": string,"opens_at": string,"session_date": string,"source": string
                  }
                  Insert: {
                    "closes_at": string,"exchange_mic": string,"opens_at": string,"session_date": string,"source": string
                  }
                  Update: {
                    "closes_at"?: string,"exchange_mic"?: string,"opens_at"?: string,"session_date"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"news_articles": {
                  Row: {
                    "also_seen_on": (string)[],"author": string | null,"event_id": string | null,"event_type": string,"hints": Json | null,"id": number,"ingested_at": string,"language": string | null,"published_at": string,"publisher": string,"publisher_country": string | null,"publisher_key": string,"signals": NonNullable<Json>,"snippet": string | null,"source_id": string,"syndication_count": number,"tier": number,"time_basis": string,"title": string,"title_hash": string,"url": string,"url_hash": string
                  }
                  Insert: {
                    "also_seen_on"?: (string)[],"author"?: string | null,"event_id"?: string | null,"event_type": string,"hints"?: Json | null,"id"?: never,"ingested_at"?: string,"language"?: string | null,"published_at": string,"publisher": string,"publisher_country"?: string | null,"publisher_key": string,"signals": NonNullable<Json>,"snippet"?: string | null,"source_id": string,"syndication_count"?: number,"tier": number,"time_basis": string,"title": string,"title_hash": string,"url": string,"url_hash": string
                  }
                  Update: {
                    "also_seen_on"?: (string)[],"author"?: string | null,"event_id"?: string | null,"event_type"?: string,"hints"?: Json | null,"id"?: never,"ingested_at"?: string,"language"?: string | null,"published_at"?: string,"publisher"?: string,"publisher_country"?: string | null,"publisher_key"?: string,"signals"?: NonNullable<Json>,"snippet"?: string | null,"source_id"?: string,"syndication_count"?: number,"tier"?: number,"time_basis"?: string,"title"?: string,"title_hash"?: string,"url"?: string,"url_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "news_articles_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "news_events"
      referencedColumns: ["id"]
    }
                  ]
                },"news_event_entities": {
                  Row: {
                    "confidence": number,"event_id": string,"evidence": string,"method": string,"node": string,"node_kind": string,"relation": string,"via": string | null
                  }
                  Insert: {
                    "confidence": number,"event_id": string,"evidence": string,"method": string,"node": string,"node_kind": string,"relation": string,"via"?: string | null
                  }
                  Update: {
                    "confidence"?: number,"event_id"?: string,"evidence"?: string,"method"?: string,"node"?: string,"node_kind"?: string,"relation"?: string,"via"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "news_event_entities_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "news_events"
      referencedColumns: ["id"]
    }
                  ]
                },"news_event_impacts": {
                  Row: {
                    "channel": string,"confidence": number,"direction": string,"event_id": string,"horizon": string,"id": number,"mechanism": string,"origin": string,"path": (string)[],"rationale": string,"relation_ids": (string)[],"strength": number,"target": string,"target_kind": string
                  }
                  Insert: {
                    "channel": string,"confidence": number,"direction": string,"event_id": string,"horizon": string,"id"?: never,"mechanism": string,"origin"?: string,"path"?: (string)[],"rationale": string,"relation_ids"?: (string)[],"strength": number,"target": string,"target_kind": string
                  }
                  Update: {
                    "channel"?: string,"confidence"?: number,"direction"?: string,"event_id"?: string,"horizon"?: string,"id"?: never,"mechanism"?: string,"origin"?: string,"path"?: (string)[],"rationale"?: string,"relation_ids"?: (string)[],"strength"?: number,"target"?: string,"target_kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "news_event_impacts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "news_events"
      referencedColumns: ["id"]
    }
                  ]
                },"news_events": {
                  Row: {
                    "article_count": number,"confidence": number,"confidence_breakdown": NonNullable<Json>,"contradictory": boolean,"created_at": string,"event_type": string,"fingerprint": string,"first_seen_at": string,"has_official_source": boolean,"id": string,"importance": number,"independent_sources": number,"languages": (string)[],"last_seen_at": string,"moves": NonNullable<Json>,"polarity": number,"representative_article_id": number | null,"rule_version": string,"secondary_types": (string)[],"seed": NonNullable<Json>,"status_hint": string,"summary": string,"summary_origin": string,"title": string,"unconfirmed": boolean,"updated_at": string
                  }
                  Insert: {
                    "article_count": number,"confidence": number,"confidence_breakdown": NonNullable<Json>,"contradictory"?: boolean,"created_at"?: string,"event_type": string,"fingerprint": string,"first_seen_at": string,"has_official_source"?: boolean,"id": string,"importance": number,"independent_sources": number,"languages"?: (string)[],"last_seen_at": string,"moves"?: NonNullable<Json>,"polarity"?: number,"representative_article_id"?: number | null,"rule_version": string,"secondary_types"?: (string)[],"seed": NonNullable<Json>,"status_hint"?: string,"summary": string,"summary_origin"?: string,"title": string,"unconfirmed"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "article_count"?: number,"confidence"?: number,"confidence_breakdown"?: NonNullable<Json>,"contradictory"?: boolean,"created_at"?: string,"event_type"?: string,"fingerprint"?: string,"first_seen_at"?: string,"has_official_source"?: boolean,"id"?: string,"importance"?: number,"independent_sources"?: number,"languages"?: (string)[],"last_seen_at"?: string,"moves"?: NonNullable<Json>,"polarity"?: number,"representative_article_id"?: number | null,"rule_version"?: string,"secondary_types"?: (string)[],"seed"?: NonNullable<Json>,"status_hint"?: string,"summary"?: string,"summary_origin"?: string,"title"?: string,"unconfirmed"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "news_events_representative_fk"
      columns: ["representative_article_id"]
isOneToOne: false
      referencedRelation: "news_articles"
      referencedColumns: ["id"]
    }
                  ]
                },"news_headline_translations": {
                  Row: {
                    "cache_key": string,"created_at": string,"event_id": string,"original_language": string | null,"original_title": string,"original_url": string | null,"provider": string,"provider_version": string,"source": string | null,"target_locale": string,"translated_title": string
                  }
                  Insert: {
                    "cache_key": string,"created_at"?: string,"event_id": string,"original_language"?: string | null,"original_title": string,"original_url"?: string | null,"provider": string,"provider_version": string,"source"?: string | null,"target_locale": string,"translated_title": string
                  }
                  Update: {
                    "cache_key"?: string,"created_at"?: string,"event_id"?: string,"original_language"?: string | null,"original_title"?: string,"original_url"?: string | null,"provider"?: string,"provider_version"?: string,"source"?: string | null,"target_locale"?: string,"translated_title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "news_headline_translations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "news_events"
      referencedColumns: ["id"]
    }
                  ]
                },"news_source_state": {
                  Row: {
                    "cursor": NonNullable<Json>,"kind": string,"label": string,"last_attempt_at": string | null,"last_error": string | null,"last_fetched": number,"last_inserted": number,"last_requests": number,"last_success_at": string | null,"license_terms": string,"source_id": string,"tier": number | null,"updated_at": string
                  }
                  Insert: {
                    "cursor"?: NonNullable<Json>,"kind": string,"label": string,"last_attempt_at"?: string | null,"last_error"?: string | null,"last_fetched"?: number,"last_inserted"?: number,"last_requests"?: number,"last_success_at"?: string | null,"license_terms": string,"source_id": string,"tier"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "cursor"?: NonNullable<Json>,"kind"?: string,"label"?: string,"last_attempt_at"?: string | null,"last_error"?: string | null,"last_fetched"?: number,"last_inserted"?: number,"last_requests"?: number,"last_success_at"?: string | null,"license_terms"?: string,"source_id"?: string,"tier"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"price_series": {
                  Row: {
                    "bar_count": number,"checked_at": string | null,"created_at": string,"currency": string,"dataset_id": string,"feed": string | null,"first_date": string | null,"full_loaded_at": string | null,"id": number,"last_date": string | null,"last_ingested_at": string | null,"quality_notes": NonNullable<Json>,"quality_status": string | null,"security_id": string,"source": string,"updated_at": string,"volume_basis": string
                  }
                  Insert: {
                    "bar_count"?: number,"checked_at"?: string | null,"created_at"?: string,"currency": string,"dataset_id": string,"feed"?: string | null,"first_date"?: string | null,"full_loaded_at"?: string | null,"id"?: never,"last_date"?: string | null,"last_ingested_at"?: string | null,"quality_notes"?: NonNullable<Json>,"quality_status"?: string | null,"security_id": string,"source": string,"updated_at"?: string,"volume_basis": string
                  }
                  Update: {
                    "bar_count"?: number,"checked_at"?: string | null,"created_at"?: string,"currency"?: string,"dataset_id"?: string,"feed"?: string | null,"first_date"?: string | null,"full_loaded_at"?: string | null,"id"?: never,"last_date"?: string | null,"last_ingested_at"?: string | null,"quality_notes"?: NonNullable<Json>,"quality_status"?: string | null,"security_id"?: string,"source"?: string,"updated_at"?: string,"volume_basis"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_series_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_series_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_series_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "price_series_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"sec_entities": {
                  Row: {
                    "cik": string,"company_id": string,"dataset_id": string,"exchanges": (string)[],"filer_category": string | null,"fiscal_year_end": string | null,"industry_template": string,"ingested_at": string,"name": string,"sic": string | null,"sic_description": string | null,"tickers": (string)[]
                  }
                  Insert: {
                    "cik": string,"company_id": string,"dataset_id": string,"exchanges"?: (string)[],"filer_category"?: string | null,"fiscal_year_end"?: string | null,"industry_template": string,"ingested_at"?: string,"name": string,"sic"?: string | null,"sic_description"?: string | null,"tickers"?: (string)[]
                  }
                  Update: {
                    "cik"?: string,"company_id"?: string,"dataset_id"?: string,"exchanges"?: (string)[],"filer_category"?: string | null,"fiscal_year_end"?: string | null,"industry_template"?: string,"ingested_at"?: string,"name"?: string,"sic"?: string | null,"sic_description"?: string | null,"tickers"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "sec_entities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sec_entities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "sec_entities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "sec_entities_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    }
                  ]
                },"sec_filings": {
                  Row: {
                    "accepted_at": string | null,"accession_number": string,"company_id": string,"dataset_id": string,"filing_date": string,"form": string,"ingested_at": string,"items": (string)[],"primary_document": string | null,"release_timing": string | null,"report_date": string | null
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accession_number": string,"company_id": string,"dataset_id": string,"filing_date": string,"form": string,"ingested_at"?: string,"items"?: (string)[],"primary_document"?: string | null,"release_timing"?: string | null,"report_date"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"accession_number"?: string,"company_id"?: string,"dataset_id"?: string,"filing_date"?: string,"form"?: string,"ingested_at"?: string,"items"?: (string)[],"primary_document"?: string | null,"release_timing"?: string | null,"report_date"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sec_filings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sec_filings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "sec_filings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "sec_filings_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    }
                  ]
                },"sectors": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string,"slug": string,"sort_order": number,"taxonomy_code": string,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string,"slug": string,"sort_order"?: number,"taxonomy_code": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"sort_order"?: number,"taxonomy_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sectors_taxonomy_code_fkey"
      columns: ["taxonomy_code"]
isOneToOne: false
      referencedRelation: "taxonomies"
      referencedColumns: ["code"]
    }
                  ]
                },"securities": {
                  Row: {
                    "company_id": string,"created_at": string,"currency": string,"dataset_id": string | null,"exchange_id": string,"figi": string | null,"id": string,"is_active": boolean,"is_primary": boolean,"isin": string | null,"name": string,"security_type": string,"share_class": string | null,"ticker": string,"updated_at": string
                  }
                  Insert: {
                    "company_id": string,"created_at"?: string,"currency": string,"dataset_id"?: string | null,"exchange_id": string,"figi"?: string | null,"id"?: string,"is_active"?: boolean,"is_primary"?: boolean,"isin"?: string | null,"name": string,"security_type"?: string,"share_class"?: string | null,"ticker": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"currency"?: string,"dataset_id"?: string | null,"exchange_id"?: string,"figi"?: string | null,"id"?: string,"is_active"?: boolean,"is_primary"?: boolean,"isin"?: string | null,"name"?: string,"security_type"?: string,"share_class"?: string | null,"ticker"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "securities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "securities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "securities_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "securities_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "securities_exchange_id_fkey"
      columns: ["exchange_id"]
isOneToOne: false
      referencedRelation: "exchanges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "securities_exchange_id_fkey"
      columns: ["exchange_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["exchange_id"]
    },{
      foreignKeyName: "securities_exchange_id_fkey"
      columns: ["exchange_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["exchange_id"]
    }
                  ]
                },"security_identifiers": {
                  Row: {
                    "created_at": string,"id": string,"provider": string,"provider_exchange_code": string | null,"security_id": string,"source": string,"symbol": string,"updated_at": string,"valid_from": string | null,"valid_to": string | null,"verification_note": string | null,"verified_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"provider": string,"provider_exchange_code"?: string | null,"security_id": string,"source": string,"symbol": string,"updated_at"?: string,"valid_from"?: string | null,"valid_to"?: string | null,"verification_note"?: string | null,"verified_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"provider"?: string,"provider_exchange_code"?: string | null,"security_id"?: string,"source"?: string,"symbol"?: string,"updated_at"?: string,"valid_from"?: string | null,"valid_to"?: string | null,"verification_note"?: string | null,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "security_identifiers_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "security_identifiers_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "security_identifiers_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"security_market_snapshots": {
                  Row: {
                    "as_of_date": string,"atr14": number | null,"average_dollar_volume20": number | null,"average_volume20": number | null,"bar_count": number,"close": number,"computed_at": string,"ema20": number | null,"ema200": number | null,"ema50": number | null,"first_date": string,"high_52w": number | null,"is_new_52w_high": boolean,"is_new_52w_low": boolean,"low_52w": number | null,"macd": number | null,"macd_histogram": number | null,"macd_signal": number | null,"market_cap": number | null,"market_cap_reason": string,"market_cap_shares": number | null,"market_cap_shares_as_of": string | null,"market_cap_status": string,"previous_close": number | null,"relative_volume": number | null,"return_1d": number | null,"return_1m": number | null,"return_1w": number | null,"return_1y": number | null,"return_3m": number | null,"return_3y": number | null,"return_5y": number | null,"return_6m": number | null,"return_ytd": number | null,"rsi14": number | null,"security_id": string,"series_id": number,"sma20": number | null,"sma200": number | null,"sma50": number | null,"source": string,"volume": number | null
                  }
                  Insert: {
                    "as_of_date": string,"atr14"?: number | null,"average_dollar_volume20"?: number | null,"average_volume20"?: number | null,"bar_count": number,"close": number,"computed_at"?: string,"ema20"?: number | null,"ema200"?: number | null,"ema50"?: number | null,"first_date": string,"high_52w"?: number | null,"is_new_52w_high"?: boolean,"is_new_52w_low"?: boolean,"low_52w"?: number | null,"macd"?: number | null,"macd_histogram"?: number | null,"macd_signal"?: number | null,"market_cap"?: number | null,"market_cap_reason": string,"market_cap_shares"?: number | null,"market_cap_shares_as_of"?: string | null,"market_cap_status": string,"previous_close"?: number | null,"relative_volume"?: number | null,"return_1d"?: number | null,"return_1m"?: number | null,"return_1w"?: number | null,"return_1y"?: number | null,"return_3m"?: number | null,"return_3y"?: number | null,"return_5y"?: number | null,"return_6m"?: number | null,"return_ytd"?: number | null,"rsi14"?: number | null,"security_id": string,"series_id": number,"sma20"?: number | null,"sma200"?: number | null,"sma50"?: number | null,"source": string,"volume"?: number | null
                  }
                  Update: {
                    "as_of_date"?: string,"atr14"?: number | null,"average_dollar_volume20"?: number | null,"average_volume20"?: number | null,"bar_count"?: number,"close"?: number,"computed_at"?: string,"ema20"?: number | null,"ema200"?: number | null,"ema50"?: number | null,"first_date"?: string,"high_52w"?: number | null,"is_new_52w_high"?: boolean,"is_new_52w_low"?: boolean,"low_52w"?: number | null,"macd"?: number | null,"macd_histogram"?: number | null,"macd_signal"?: number | null,"market_cap"?: number | null,"market_cap_reason"?: string,"market_cap_shares"?: number | null,"market_cap_shares_as_of"?: string | null,"market_cap_status"?: string,"previous_close"?: number | null,"relative_volume"?: number | null,"return_1d"?: number | null,"return_1m"?: number | null,"return_1w"?: number | null,"return_1y"?: number | null,"return_3m"?: number | null,"return_3y"?: number | null,"return_5y"?: number | null,"return_6m"?: number | null,"return_ytd"?: number | null,"rsi14"?: number | null,"security_id"?: string,"series_id"?: number,"sma20"?: number | null,"sma200"?: number | null,"sma50"?: number | null,"source"?: string,"volume"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "security_market_snapshots_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "security_market_snapshots_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "security_market_snapshots_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "security_market_snapshots_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "price_series"
      referencedColumns: ["id"]
    }
                  ]
                },"security_share_classes": {
                  Row: {
                    "accession_number": string,"check_rule": string | null,"check_status": string,"class_member": string | null,"company_id": string,"computed_at": string,"dataset_id": string,"deviation": number | null,"form": string | null,"note": string | null,"period_end": string | null,"reference_kind": string | null,"reference_period_end": string | null,"reference_shares": number | null,"resolved_via": string | null,"security_id": string,"shares": number | null,"shares_as_of": string | null,"source": string
                  }
                  Insert: {
                    "accession_number": string,"check_rule"?: string | null,"check_status": string,"class_member"?: string | null,"company_id": string,"computed_at"?: string,"dataset_id": string,"deviation"?: number | null,"form"?: string | null,"note"?: string | null,"period_end"?: string | null,"reference_kind"?: string | null,"reference_period_end"?: string | null,"reference_shares"?: number | null,"resolved_via"?: string | null,"security_id": string,"shares"?: number | null,"shares_as_of"?: string | null,"source": string
                  }
                  Update: {
                    "accession_number"?: string,"check_rule"?: string | null,"check_status"?: string,"class_member"?: string | null,"company_id"?: string,"computed_at"?: string,"dataset_id"?: string,"deviation"?: number | null,"form"?: string | null,"note"?: string | null,"period_end"?: string | null,"reference_kind"?: string | null,"reference_period_end"?: string | null,"reference_shares"?: number | null,"resolved_via"?: string | null,"security_id"?: string,"shares"?: number | null,"shares_as_of"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "security_share_classes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "security_share_classes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "security_share_classes_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["company_id"]
    },{
      foreignKeyName: "security_share_classes_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "security_share_classes_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "security_share_classes_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "security_share_classes_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"shares_outstanding": {
                  Row: {
                    "as_of_date": string,"basis": string,"dataset_id": string,"ingested_at": string,"security_id": string,"shares": number,"source": string,"source_field": string
                  }
                  Insert: {
                    "as_of_date": string,"basis": string,"dataset_id": string,"ingested_at"?: string,"security_id": string,"shares": number,"source": string,"source_field": string
                  }
                  Update: {
                    "as_of_date"?: string,"basis"?: string,"dataset_id"?: string,"ingested_at"?: string,"security_id"?: string,"shares"?: number,"source"?: string,"source_field"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shares_outstanding_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shares_outstanding_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shares_outstanding_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "shares_outstanding_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"sub_industries": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"industry_id": string,"name": string,"slug": string,"taxonomy_code": string,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"industry_id": string,"name": string,"slug": string,"taxonomy_code": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"industry_id"?: string,"name"?: string,"slug"?: string,"taxonomy_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sub_industries_industry_id_taxonomy_code_fkey"
      columns: ["industry_id","taxonomy_code"]
isOneToOne: false
      referencedRelation: "industries"
      referencedColumns: ["id","taxonomy_code"]
    },{
      foreignKeyName: "sub_industries_taxonomy_code_fkey"
      columns: ["taxonomy_code"]
isOneToOne: false
      referencedRelation: "taxonomies"
      referencedColumns: ["code"]
    }
                  ]
                },"sync_cursors": {
                  Row: {
                    "full_refresh_required": boolean,"job_type": string,"last_run_id": string | null,"last_success_at": string | null,"last_value": string | null,"provider": string,"security_id": string,"updated_at": string
                  }
                  Insert: {
                    "full_refresh_required"?: boolean,"job_type": string,"last_run_id"?: string | null,"last_success_at"?: string | null,"last_value"?: string | null,"provider": string,"security_id": string,"updated_at"?: string
                  }
                  Update: {
                    "full_refresh_required"?: boolean,"job_type"?: string,"last_run_id"?: string | null,"last_success_at"?: string | null,"last_value"?: string | null,"provider"?: string,"security_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_cursors_last_run_id_fkey"
      columns: ["last_run_id"]
isOneToOne: false
      referencedRelation: "sync_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_cursors_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sync_cursors_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "sync_cursors_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"sync_leases": {
                  Row: {
                    "acquired_at": string,"expires_at": string,"holder": string,"name": string
                  }
                  Insert: {
                    "acquired_at"?: string,"expires_at": string,"holder": string,"name": string
                  }
                  Update: {
                    "acquired_at"?: string,"expires_at"?: string,"holder"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sync_runs": {
                  Row: {
                    "credits_estimated": number | null,"credits_used": number | null,"errors": NonNullable<Json>,"finished_at": string | null,"id": string,"job_type": string,"metrics": NonNullable<Json>,"params": NonNullable<Json>,"provider": string,"records_read": number,"records_written": number,"requests_made": number | null,"scope": string,"started_at": string,"status": string,"warnings": NonNullable<Json>
                  }
                  Insert: {
                    "credits_estimated"?: number | null,"credits_used"?: number | null,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"job_type": string,"metrics"?: NonNullable<Json>,"params"?: NonNullable<Json>,"provider": string,"records_read"?: number,"records_written"?: number,"requests_made"?: number | null,"scope": string,"started_at"?: string,"status": string,"warnings"?: NonNullable<Json>
                  }
                  Update: {
                    "credits_estimated"?: number | null,"credits_used"?: number | null,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"job_type"?: string,"metrics"?: NonNullable<Json>,"params"?: NonNullable<Json>,"provider"?: string,"records_read"?: number,"records_written"?: number,"requests_made"?: number | null,"scope"?: string,"started_at"?: string,"status"?: string,"warnings"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"taxonomies": {
                  Row: {
                    "code": string,"created_at": string,"dataset_id": string | null,"name": string,"publisher": string | null,"updated_at": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"dataset_id"?: string | null,"name": string,"publisher"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"dataset_id"?: string | null,"name"?: string,"publisher"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "taxonomies_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    }
                  ]
                },"themes": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"name": string,"parent_id": string | null,"slug": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"parent_id"?: string | null,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"parent_id"?: string | null,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "themes_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "themes"
      referencedColumns: ["id"]
    }
                  ]
                },"valuation_snapshots": {
                  Row: {
                    "as_of_date": string,"dataset_id": string | null,"ingested_at": string,"method": string,"metric": string,"security_id": string,"source": string,"value": number,"value_origin": string
                  }
                  Insert: {
                    "as_of_date": string,"dataset_id"?: string | null,"ingested_at"?: string,"method": string,"metric": string,"security_id": string,"source": string,"value": number,"value_origin": string
                  }
                  Update: {
                    "as_of_date"?: string,"dataset_id"?: string | null,"ingested_at"?: string,"method"?: string,"metric"?: string,"security_id"?: string,"source"?: string,"value"?: number,"value_origin"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "valuation_snapshots_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "valuation_snapshots_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "valuation_snapshots_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "valuation_snapshots_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                }
          }
          Views: {
            "v_daily_prices": {
                  Row: {
                    "close": number | null,"high": number | null,"low": number | null,"open": number | null,"provider_adjusted_close": number | null,"security_id": string | null,"source": string | null,"trade_date": string | null,"volume": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_series_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_series_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "price_series_security_id_fkey"
      columns: ["security_id"]
isOneToOne: true
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"v_index_constituent_securities": {
                  Row: {
                    "added_on": string | null,"cik": string | null,"company_id": string | null,"company_name": string | null,"company_slug": string | null,"currency": string | null,"description": string | null,"domicile_country_code": string | null,"employees": number | null,"exchange_acronym": string | null,"exchange_country_code": string | null,"exchange_id": string | null,"exchange_mic": string | null,"exchange_name": string | null,"founded_year": number | null,"hq_city": string | null,"hq_country_code": string | null,"hq_country_name": string | null,"hq_region": string | null,"index_id": string | null,"index_slug": string | null,"industry_code": string | null,"industry_group_code": string | null,"industry_group_id": string | null,"industry_group_name": string | null,"industry_group_slug": string | null,"industry_id": string | null,"industry_name": string | null,"industry_slug": string | null,"is_active": boolean | null,"is_primary": boolean | null,"legal_name": string | null,"logo_url": string | null,"sector_code": string | null,"sector_id": string | null,"sector_name": string | null,"sector_slug": string | null,"security_id": string | null,"security_name": string | null,"security_type": string | null,"share_class": string | null,"sub_industry_code": string | null,"sub_industry_id": string | null,"sub_industry_name": string | null,"sub_industry_slug": string | null,"taxonomy_code": string | null,"ticker": string | null,"website": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "companies_domicile_country_code_fkey"
      columns: ["domicile_country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "companies_hq_country_code_fkey"
      columns: ["hq_country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "exchanges_country_code_fkey"
      columns: ["exchange_country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "index_constituents_index_id_fkey"
      columns: ["index_id"]
isOneToOne: false
      referencedRelation: "indices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sectors_taxonomy_code_fkey"
      columns: ["taxonomy_code"]
isOneToOne: false
      referencedRelation: "taxonomies"
      referencedColumns: ["code"]
    }
                  ]
                },"v_index_memberships": {
                  Row: {
                    "added_on": string | null,"dataset_id": string | null,"index_code": string | null,"index_id": string | null,"index_kind": string | null,"index_name": string | null,"index_short_name": string | null,"index_slug": string | null,"security_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "index_constituents_dataset_id_fkey"
      columns: ["dataset_id"]
isOneToOne: false
      referencedRelation: "datasets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "index_constituents_index_id_fkey"
      columns: ["index_id"]
isOneToOne: false
      referencedRelation: "indices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "index_constituents_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "securities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "index_constituents_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_index_constituent_securities"
      referencedColumns: ["security_id"]
    },{
      foreignKeyName: "index_constituents_security_id_fkey"
      columns: ["security_id"]
isOneToOne: false
      referencedRelation: "v_securities"
      referencedColumns: ["security_id"]
    }
                  ]
                },"v_securities": {
                  Row: {
                    "cik": string | null,"company_id": string | null,"company_name": string | null,"company_slug": string | null,"currency": string | null,"description": string | null,"domicile_country_code": string | null,"employees": number | null,"exchange_acronym": string | null,"exchange_country_code": string | null,"exchange_id": string | null,"exchange_mic": string | null,"exchange_name": string | null,"founded_year": number | null,"hq_city": string | null,"hq_country_code": string | null,"hq_country_name": string | null,"hq_region": string | null,"industry_code": string | null,"industry_group_code": string | null,"industry_group_id": string | null,"industry_group_name": string | null,"industry_group_slug": string | null,"industry_id": string | null,"industry_name": string | null,"industry_slug": string | null,"is_active": boolean | null,"is_primary": boolean | null,"legal_name": string | null,"logo_url": string | null,"sector_code": string | null,"sector_id": string | null,"sector_name": string | null,"sector_slug": string | null,"security_id": string | null,"security_name": string | null,"security_type": string | null,"share_class": string | null,"sub_industry_code": string | null,"sub_industry_id": string | null,"sub_industry_name": string | null,"sub_industry_slug": string | null,"taxonomy_code": string | null,"ticker": string | null,"website": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "companies_domicile_country_code_fkey"
      columns: ["domicile_country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "companies_hq_country_code_fkey"
      columns: ["hq_country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "exchanges_country_code_fkey"
      columns: ["exchange_country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "sectors_taxonomy_code_fkey"
      columns: ["taxonomy_code"]
isOneToOne: false
      referencedRelation: "taxonomies"
      referencedColumns: ["code"]
    }
                  ]
                }
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

