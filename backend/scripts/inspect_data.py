#!/usr/bin/env python3
"""
Script to inspect all fields and data saved in ETL tables
Usage: python scripts/inspect_data.py [--table licitaciones|ordenes_compra] [--limit N] [--format json|csv|table]
"""
import sys
import os
import argparse
from datetime import datetime
from typing import Optional, List, Dict, Any
import json

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.models.licitacion import Licitacion
from app.models.orden_compra import OrdenCompra


def get_table_info(session, model_class):
    """Get table structure information"""
    inspector = inspect(model_class)
    columns = []
    for column in inspector.columns:
        columns.append({
            'name': column.name,
            'type': str(column.type),
            'nullable': column.nullable,
            'primary_key': column.primary_key,
            'default': str(column.default) if column.default else None
        })
    return columns


def format_value(value):
    """Format value for display"""
    if value is None:
        return "NULL"
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, indent=2)
    if isinstance(value, float):
        return f"{value:,.2f}"
    return str(value)


def print_table_format(data: List[Dict[str, Any]], columns: List[str]):
    """Print data in table format"""
    if not data:
        print("No data found.")
        return
    
    # Calculate column widths
    col_widths = {col: len(col) for col in columns}
    for row in data:
        for col in columns:
            val = format_value(row.get(col, ''))
            col_widths[col] = max(col_widths[col], len(val))
    
    # Print header
    header = " | ".join(col.ljust(col_widths[col]) for col in columns)
    print(header)
    print("-" * len(header))
    
    # Print rows
    for row in data:
        values = [format_value(row.get(col, ''))[:col_widths[col]] for col in columns]
        print(" | ".join(val.ljust(col_widths[col]) for val in values))


def print_csv_format(data: List[Dict[str, Any]], columns: List[str]):
    """Print data in CSV format"""
    import csv
    import io
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()
    
    for row in data:
        # Convert complex types to JSON strings
        row_copy = {}
        for key, value in row.items():
            if isinstance(value, (dict, list)):
                row_copy[key] = json.dumps(value, ensure_ascii=False)
            else:
                row_copy[key] = value
        writer.writerow(row_copy)
    
    print(output.getvalue())


def inspect_table(
    table_name: str,
    limit: Optional[int] = None,
    output_format: str = "table",
    show_structure: bool = True
):
    """Inspect a specific table"""
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Select model
        if table_name == "licitaciones":
            model_class = Licitacion
        elif table_name == "ordenes_compra":
            model_class = OrdenCompra
        else:
            print(f"Unknown table: {table_name}")
            return
        
        # Get table structure
        if show_structure:
            print(f"\n{'='*80}")
            print(f"Table: {table_name}")
            print(f"{'='*80}\n")
            
            columns_info = get_table_info(session, model_class)
            print("Table Structure:")
            print("-" * 80)
            for col_info in columns_info:
                pk_marker = " [PK]" if col_info['primary_key'] else ""
                nullable_marker = " (nullable)" if col_info['nullable'] else " (not null)"
                default_marker = f" default={col_info['default']}" if col_info['default'] else ""
                print(f"  {col_info['name']:<30} {col_info['type']:<20}{pk_marker}{nullable_marker}{default_marker}")
            print()
        
        # Get record count
        total_count = session.query(model_class).count()
        print(f"Total records: {total_count}")
        
        if total_count == 0:
            print("No data found in table.")
            return
        
        # Get data
        query = session.query(model_class)
        if limit:
            query = query.limit(limit)
        
        records = query.all()
        
        # Convert to dictionaries
        data = []
        for record in records:
            record_dict = {}
            for column in model_class.__table__.columns:
                value = getattr(record, column.name)
                record_dict[column.name] = value
            data.append(record_dict)
        
        # Get column names
        columns = [col.name for col in model_class.__table__.columns]
        
        # Print data
        print(f"\nShowing {len(data)} of {total_count} records:\n")
        
        if output_format == "json":
            print(json.dumps(data, indent=2, ensure_ascii=False, default=str))
        elif output_format == "csv":
            print_csv_format(data, columns)
        else:  # table format
            print_table_format(data, columns)
        
        # Print summary statistics
        print(f"\n{'='*80}")
        print("Summary Statistics:")
        print("-" * 80)
        
        # Count non-null values per column
        for col in columns:
            non_null_count = sum(1 for row in data if row.get(col) is not None)
            null_count = len(data) - non_null_count
            null_percentage = (null_count / len(data) * 100) if data else 0
            print(f"  {col:<30} Non-null: {non_null_count:>5} ({100-null_percentage:>5.1f}%) | Null: {null_count:>5} ({null_percentage:>5.1f}%)")
        
    except Exception as e:
        print(f"Error inspecting table: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        session.close()
        engine.dispose()


def inspect_all_tables(limit: Optional[int] = None, output_format: str = "table"):
    """Inspect all ETL tables"""
    print("="*80)
    print("ETL Data Inspection Report")
    print(f"Generated: {datetime.now().isoformat()}")
    print("="*80)
    
    inspect_table("licitaciones", limit=limit, output_format=output_format)
    print("\n\n")
    inspect_table("ordenes_compra", limit=limit, output_format=output_format)


def main():
    parser = argparse.ArgumentParser(
        description="Inspect all fields and data saved in ETL tables"
    )
    parser.add_argument(
        "--table",
        choices=["licitaciones", "ordenes_compra"],
        help="Specific table to inspect (default: all tables)"
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Limit number of records to display (default: all)"
    )
    parser.add_argument(
        "--format",
        choices=["table", "json", "csv"],
        default="table",
        help="Output format (default: table)"
    )
    parser.add_argument(
        "--no-structure",
        action="store_true",
        help="Don't show table structure"
    )
    
    args = parser.parse_args()
    
    if args.table:
        inspect_table(
            args.table,
            limit=args.limit,
            output_format=args.format,
            show_structure=not args.no_structure
        )
    else:
        inspect_all_tables(limit=args.limit, output_format=args.format)


if __name__ == "__main__":
    main()

